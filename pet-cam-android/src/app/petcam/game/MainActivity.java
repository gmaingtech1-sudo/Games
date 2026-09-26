package app.petcam.game;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Vibrator;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;

/**
 * Pet Cam for Android: one full-screen WebView running the web game.
 *
 * The game files ship in the APK under assets/game and are served from a
 * private https address, so the page gets a normal secure origin (which the
 * camera requires) without needing the internet. window.AndroidHost is the
 * bridge the game's js/host.js looks for: it stores the save in
 * SharedPreferences, drives the vibration motor, and saves or shares photos.
 * The activity sends back pause, resume, back and photo-saved messages.
 */
public class MainActivity extends Activity {

    // Reserved for apps to serve their own files; it never reaches the network.
    private static final String ASSET_HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + ASSET_HOST + "/game/index.html";
    private static final String SAVE_KEY = "pet-cam-save-v1";
    private static final int NIGHT = Color.rgb(0x1B, 0x18, 0x30);

    private static final int ASK_CAMERA = 1;
    private static final int ASK_STORAGE = 2;

    private WebView web;
    private SharedPreferences prefs;
    private Vibrator vibrator;
    private volatile boolean overlayOpen;

    // The page's camera request, held while Android asks the player.
    private PermissionRequest pendingCamera;
    // A photo waiting for storage access (Android 9 and older).
    private byte[] pendingPhoto;
    private String pendingPhotoName;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("pet-cam", MODE_PRIVATE);
        vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
        // You're looking at the screen the whole time; don't let it dim.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = new WebView(this);
        web.setBackgroundColor(NIGHT);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        // Long presses belong to the game (stroking the pet), not text selection.
        web.setOnLongClickListener(new View.OnLongClickListener() {
            @Override
            public boolean onLongClick(View v) {
                return true;
            }
        });
        web.setLongClickable(false);
        web.setHapticFeedbackEnabled(false);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setTextZoom(100);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);

        web.setWebViewClient(new GameClient());
        web.setWebChromeClient(new CameraClient());
        web.addJavascriptInterface(new Bridge(), "AndroidHost");
        setContentView(web);
        web.loadUrl(START_URL);
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        send("{t: 'resume'}");
    }

    @Override
    protected void onPause() {
        send("{t: 'pause'}"); // the game saves and turns the camera off
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        // Close a photo, the menu, or put the ball down first.
        if (overlayOpen) {
            send("{t: 'back'}");
            return;
        }
        super.onBackPressed();
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        boolean granted = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
        if (code == ASK_CAMERA && pendingCamera != null) {
            if (granted) pendingCamera.grant(new String[] {PermissionRequest.RESOURCE_VIDEO_CAPTURE});
            else pendingCamera.deny(); // the game falls back to its pretend room
            pendingCamera = null;
        } else if (code == ASK_STORAGE && pendingPhoto != null) {
            final byte[] data = pendingPhoto;
            final String name = pendingPhotoName;
            pendingPhoto = null;
            pendingPhotoName = null;
            if (!granted) {
                photoSaved(false);
                return;
            }
            new Thread(new Runnable() {
                @Override
                public void run() {
                    photoSaved(writeToGallery(data, name));
                }
            }).start();
        }
    }

    private void send(final String msg) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                web.evaluateJavascript("window.PC && PC.host && PC.host.receive(" + msg + ");", null);
            }
        });
    }

    private void photoSaved(boolean ok) {
        send("{t: 'photo-saved', ok: " + ok + "}");
    }

    /* ---------------- Photos ---------------- */

    private boolean writeToGallery(byte[] data, String name) {
        if (Build.VERSION.SDK_INT >= 29) {
            // Android 10+: add it to Pictures/Pet Cam through MediaStore, no permission needed.
            // These column names are newer than the SDK this compiles against.
            ContentResolver cr = getContentResolver();
            ContentValues v = new ContentValues();
            v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
            v.put(MediaStore.MediaColumns.MIME_TYPE, "image/jpeg");
            v.put("relative_path", Environment.DIRECTORY_PICTURES + "/Pet Cam");
            v.put("is_pending", 1);
            Uri uri = null;
            try {
                uri = cr.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, v);
                if (uri == null) return false;
                OutputStream out = cr.openOutputStream(uri);
                if (out == null) throw new IOException("no stream");
                try {
                    out.write(data);
                } finally {
                    out.close();
                }
                ContentValues done = new ContentValues();
                done.put("is_pending", 0);
                cr.update(uri, done, null, null);
                return true;
            } catch (Exception e) {
                if (uri != null) cr.delete(uri, null, null);
                return false;
            }
        }
        // Android 7–9: write the file into Pictures/Pet Cam and tell the gallery.
        try {
            File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), "Pet Cam");
            if (!dir.isDirectory() && !dir.mkdirs()) return false;
            File f = new File(dir, name);
            FileOutputStream out = new FileOutputStream(f);
            try {
                out.write(data);
            } finally {
                out.close();
            }
            MediaScannerConnection.scanFile(this, new String[] {f.getAbsolutePath()}, new String[] {"image/jpeg"}, null);
            return true;
        } catch (IOException e) {
            return false;
        }
    }

    // Only simple file names from the game, never paths.
    private static String safeName(String name) {
        String n = name == null ? "" : name.replaceAll("[^A-Za-z0-9._-]", "-");
        if (!n.endsWith(".jpg")) n = n + ".jpg";
        return n.length() > 80 ? n.substring(n.length() - 80) : n;
    }

    /** Serves assets/ at https://appassets.androidplatform.net/ and keeps other links out of the app. */
    private final class GameClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri url = request.getUrl();
            if (!ASSET_HOST.equals(url.getHost())) return null; // e.g. Google Fonts
            String path = url.getPath();
            if (path == null || path.contains("..")) return notFound();
            if (path.startsWith("/")) path = path.substring(1);
            try {
                InputStream in = getAssets().open(path);
                Map<String, String> headers = new HashMap<>();
                headers.put("Cache-Control", "no-cache");
                return new WebResourceResponse(mimeType(path), null, 200, "OK", headers, in);
            } catch (IOException e) {
                return notFound();
            }
        }

        @Override
        @SuppressWarnings("deprecation")
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            Uri uri = Uri.parse(url);
            if (ASSET_HOST.equals(uri.getHost())) return false;
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (Exception e) {
                // no browser available; stay put
            }
            return true;
        }

        private WebResourceResponse notFound() {
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found",
                    new HashMap<String, String>(), new ByteArrayInputStream(new byte[0]));
        }

        private String mimeType(String path) {
            if (path.endsWith(".html")) return "text/html";
            if (path.endsWith(".js")) return "text/javascript";
            if (path.endsWith(".css")) return "text/css";
            if (path.endsWith(".png")) return "image/png";
            if (path.endsWith(".svg")) return "image/svg+xml";
            if (path.endsWith(".json") || path.endsWith(".webmanifest")) return "application/json";
            return "application/octet-stream";
        }
    }

    /** Lets the page use the camera, after Android's own permission prompt. */
    private final class CameraClient extends WebChromeClient {
        @Override
        public void onPermissionRequest(final PermissionRequest request) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    boolean onlyOurs = ASSET_HOST.equals(request.getOrigin().getHost());
                    boolean wantsCamera = Arrays.asList(request.getResources())
                            .contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE);
                    if (!onlyOurs || !wantsCamera) {
                        request.deny();
                        return;
                    }
                    if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                        request.grant(new String[] {PermissionRequest.RESOURCE_VIDEO_CAPTURE});
                        return;
                    }
                    if (pendingCamera != null) pendingCamera.deny();
                    pendingCamera = request;
                    requestPermissions(new String[] {Manifest.permission.CAMERA}, ASK_CAMERA);
                }
            });
        }

        @Override
        public void onPermissionRequestCanceled(PermissionRequest request) {
            if (request == pendingCamera) pendingCamera = null;
        }
    }

    /** Exposed to the page as window.AndroidHost. Called on a WebView background thread. */
    private final class Bridge {
        @JavascriptInterface
        public String loadSave() {
            return prefs.getString(SAVE_KEY, null);
        }

        @JavascriptInterface
        public void writeSave(String json) {
            prefs.edit().putString(SAVE_KEY, json).apply();
        }

        @JavascriptInterface
        public void clearSave() {
            prefs.edit().remove(SAVE_KEY).apply();
        }

        @JavascriptInterface
        public void setOverlay(boolean open) {
            overlayOpen = open;
        }

        /** Saves a base64 JPEG to the gallery; answers later with a photo-saved message. */
        @JavascriptInterface
        public void savePhoto(String base64, String name) {
            final byte[] data;
            try {
                data = Base64.decode(base64, Base64.DEFAULT);
            } catch (IllegalArgumentException e) {
                photoSaved(false);
                return;
            }
            final String file = safeName(name);
            if (Build.VERSION.SDK_INT < 29
                    && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        pendingPhoto = data;
                        pendingPhotoName = file;
                        requestPermissions(new String[] {Manifest.permission.WRITE_EXTERNAL_STORAGE}, ASK_STORAGE);
                    }
                });
                return;
            }
            photoSaved(writeToGallery(data, file));
        }

        /** Opens the share sheet for a base64 JPEG. */
        @JavascriptInterface
        public boolean sharePhoto(String base64, String name) {
            try {
                byte[] data = Base64.decode(base64, Base64.DEFAULT);
                File dir = PhotoProvider.dir(MainActivity.this);
                // Only the latest shared photo is kept around.
                File[] old = dir.listFiles();
                if (old != null) for (File f : old) f.delete();
                String file = safeName(name);
                FileOutputStream out = new FileOutputStream(new File(dir, file));
                try {
                    out.write(data);
                } finally {
                    out.close();
                }
                Uri uri = PhotoProvider.uriFor(file);
                final Intent send = new Intent(Intent.ACTION_SEND);
                send.setType("image/jpeg");
                send.putExtra(Intent.EXTRA_STREAM, uri);
                send.setClipData(ClipData.newRawUri(null, uri));
                send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            startActivity(Intent.createChooser(send, null));
                        } catch (Exception e) {
                            // nothing can receive it
                        }
                    }
                });
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public void haptic(String style) {
            if (vibrator == null || !vibrator.hasVibrator()) return;
            if (Build.VERSION.SDK_INT >= 29 && playPredefined(style)) return;
            if ("success".equals(style)) {
                vibrator.vibrate(new long[] {0, 18, 70, 18}, -1);
            } else if ("selection".equals(style)) {
                vibrator.vibrate(8);
            } else if ("light".equals(style)) {
                vibrator.vibrate(14);
            } else if ("medium".equals(style)) {
                vibrator.vibrate(24);
            } else {
                vibrator.vibrate(45);
            }
        }

        // Android 10+ has tuned "tick"/"click" effects that feel much better
        // than raw buzzes. The APK compiles against an older SDK, so reach them
        // by reflection: VibrationEffect.createPredefined(id).
        private boolean playPredefined(String style) {
            int id;
            if ("selection".equals(style)) id = 2;      // EFFECT_TICK
            else if ("light".equals(style)) id = 0;     // EFFECT_CLICK
            else if ("medium".equals(style)) id = 5;    // EFFECT_HEAVY_CLICK
            else if ("success".equals(style)) id = 1;   // EFFECT_DOUBLE_CLICK
            else return false;                          // heavy: a longer buzz reads better
            try {
                Class<?> effectClass = Class.forName("android.os.VibrationEffect");
                Object effect = effectClass.getMethod("createPredefined", int.class).invoke(null, id);
                Vibrator.class.getMethod("vibrate", effectClass).invoke(vibrator, effect);
                return true;
            } catch (Exception e) {
                return false;
            }
        }
    }
}
