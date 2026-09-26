package app.cosmos360.game;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
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
import java.util.HashMap;
import java.util.Map;

/**
 * Cosmos 360 for Android: one full-screen WebView running the web game.
 *
 * The game files ship in the APK under assets/game and are served from a
 * private https address, so the page gets a normal secure origin (which the
 * motion sensors need) without the internet. Progress lives in the page's
 * localStorage, which the WebView keeps in the app's private storage.
 *
 * window.AndroidHost lets the game save or share photos and tell the app
 * when a sheet is open, so the back button closes it first. The activity
 * sends pause, resume, back and photo-saved messages to window.cosmosApp.
 */
public class MainActivity extends Activity {

    // Reserved for apps to serve their own files; it never reaches the network.
    private static final String ASSET_HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + ASSET_HOST + "/game/index.html";
    private static final int SPACE = Color.rgb(0x03, 0x05, 0x0B);
    private static final int ASK_STORAGE = 2;

    private WebView web;
    private volatile boolean overlayOpen;

    // A photo waiting for storage access (Android 9 and older).
    private byte[] pendingPhoto;
    private String pendingPhotoName;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // You're looking around the whole time; don't let the screen dim.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        useWholeScreen();

        web = new WebView(this);
        web.setBackgroundColor(SPACE);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        // Long presses and drags belong to the game, not text selection.
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
        web.setWebChromeClient(new WebChromeClient());
        web.addJavascriptInterface(new Bridge(), "AndroidHost");
        setContentView(web);
        web.loadUrl(START_URL);
    }

    // Draw under the status bar, navigation bar and camera cutout.
    private void useWholeScreen() {
        if (Build.VERSION.SDK_INT >= 28) {
            try {
                WindowManager.LayoutParams lp = getWindow().getAttributes();
                // LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES; newer than the SDK this compiles against.
                WindowManager.LayoutParams.class.getField("layoutInDisplayCutoutMode").setInt(lp, 1);
                getWindow().setAttributes(lp);
            } catch (Exception e) {
                // older Android: the cutout area stays black
            }
        }
        hideBars();
    }

    @SuppressWarnings("deprecation")
    private void hideBars() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideBars();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        web.resumeTimers();
        send("{t: 'resume'}");
    }

    @Override
    protected void onPause() {
        send("{t: 'pause'}"); // the game saves and quiets its sound
        web.onPause();
        web.pauseTimers();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        // Close the logbook, star map or other sheet first.
        if (overlayOpen) {
            send("{t: 'back'}");
            return;
        }
        super.onBackPressed();
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        boolean granted = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
        if (code == ASK_STORAGE && pendingPhoto != null) {
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
                web.evaluateJavascript("window.cosmosApp && cosmosApp.receive(" + msg + ");", null);
            }
        });
    }

    private void photoSaved(boolean ok) {
        send("{t: 'photo-saved', ok: " + ok + "}");
    }

    /* ---------------- Photos ---------------- */

    private boolean writeToGallery(byte[] data, String name) {
        if (Build.VERSION.SDK_INT >= 29) {
            // Android 10+: add it to Pictures/Cosmos 360 through MediaStore, no permission needed.
            // These column names are newer than the SDK this compiles against.
            ContentResolver cr = getContentResolver();
            ContentValues v = new ContentValues();
            v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
            v.put(MediaStore.MediaColumns.MIME_TYPE, "image/jpeg");
            v.put("relative_path", Environment.DIRECTORY_PICTURES + "/Cosmos 360");
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
        // Android 7–9: write the file into Pictures/Cosmos 360 and tell the gallery.
        try {
            File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), "Cosmos 360");
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
            if (path.endsWith(".jpg")) return "image/jpeg";
            if (path.endsWith(".svg")) return "image/svg+xml";
            if (path.endsWith(".json") || path.endsWith(".webmanifest")) return "application/json";
            return "application/octet-stream";
        }
    }

    /** Exposed to the page as window.AndroidHost. Called on a WebView background thread. */
    private final class Bridge {
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
    }
}
