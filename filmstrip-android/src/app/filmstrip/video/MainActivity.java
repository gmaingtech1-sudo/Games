package app.filmstrip.video;

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
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Filmstrip for Android: one full-screen WebView running the web app.
 *
 * The app's files ship in the APK under assets/app and are served from a
 * private https address, so the page gets a normal secure origin (which the
 * camera and microphone require) without needing the internet. The native
 * side adds what a bare WebView can't do: the photo, clip and song pickers,
 * camera and microphone permissions, and window.AndroidHost, the bridge the
 * app's js/host.js looks for. Through it the page keeps the screen on, and
 * copies a finished video over in chunks so it can be saved to the gallery
 * (Movies/Filmstrip) or shared. The activity sends back back and
 * video-saved messages.
 */
public class MainActivity extends Activity {

    // Reserved for apps to serve their own files; it never reaches the network.
    private static final String ASSET_HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + ASSET_HOST + "/app/index.html";
    private static final int INK = Color.rgb(0x12, 0x10, 0x16);

    private static final int ASK_MEDIA = 1;
    private static final int ASK_STORAGE = 2;
    private static final int PICK_FILES = 3;

    private WebView web;
    private volatile boolean overlayOpen;

    // The page's camera/microphone request, held while Android asks.
    private PermissionRequest pendingMedia;
    // The page's file picker, waiting for the chosen files.
    private ValueCallback<Uri[]> pendingPick;
    // The finished video, as it arrives from the page and once it's complete.
    private final Object videoLock = new Object();
    private OutputStream videoOut;
    private File videoFile;
    private File readyVideo;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        clearVideos();

        web = new WebView(this);
        web.setBackgroundColor(INK);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setTextZoom(100);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setAllowFileAccess(false);
        // The pickers hand the page content:// links to your photos and clips.
        s.setAllowContentAccess(true);

        web.setWebViewClient(new AppClient());
        web.setWebChromeClient(new ChromeClient());
        web.addJavascriptInterface(new Bridge(), "AndroidHost");
        setContentView(web);
        web.loadUrl(START_URL);
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onPause() {
        // The page sees itself hidden and pauses saving until you come back.
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
        // Close a sheet or the camera first.
        if (overlayOpen) {
            send("{t: 'back'}");
            return;
        }
        super.onBackPressed();
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        if (code == ASK_MEDIA && pendingMedia != null) {
            grantWhatWeCan(pendingMedia);
            pendingMedia = null;
        } else if (code == ASK_STORAGE) {
            boolean granted = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
            if (granted) saveInBackground();
            else videoSaved(false);
        }
    }

    @Override
    protected void onActivityResult(int code, int result, Intent data) {
        if (code != PICK_FILES) {
            super.onActivityResult(code, result, data);
            return;
        }
        if (pendingPick == null) return;
        List<Uri> uris = new ArrayList<>();
        if (result == RESULT_OK && data != null) {
            ClipData clip = data.getClipData();
            if (clip != null) {
                for (int i = 0; i < clip.getItemCount(); i++) {
                    Uri u = clip.getItemAt(i).getUri();
                    if (u != null) uris.add(u);
                }
            } else if (data.getData() != null) {
                uris.add(data.getData());
            }
        }
        pendingPick.onReceiveValue(uris.isEmpty() ? null : uris.toArray(new Uri[0]));
        pendingPick = null;
    }

    private void send(final String msg) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                web.evaluateJavascript("window.FS && FS.host && FS.host.receive(" + msg + ");", null);
            }
        });
    }

    private void videoSaved(boolean ok) {
        send("{t: 'video-saved', ok: " + ok + "}");
    }

    /* ---------------- Camera and microphone ---------------- */

    private void grantWhatWeCan(PermissionRequest request) {
        List<String> ok = new ArrayList<>();
        for (String r : request.getResources()) {
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r) && has(Manifest.permission.CAMERA)) ok.add(r);
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r) && has(Manifest.permission.RECORD_AUDIO)) ok.add(r);
        }
        // All or nothing. If the microphone was refused, the page asks again
        // for the camera alone and records without sound.
        if (ok.size() == request.getResources().length) request.grant(ok.toArray(new String[0]));
        else request.deny();
    }

    private boolean has(String permission) {
        return checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED;
    }

    /* ---------------- Finished videos ---------------- */

    private File videoDir() {
        File d = new File(getCacheDir(), "videos");
        d.mkdirs();
        return d;
    }

    private void clearVideos() {
        File[] old = videoDir().listFiles();
        if (old != null) for (File f : old) f.delete();
    }

    // Only simple file names from the page, never paths.
    private static String safeName(String name, String mime) {
        String n = name == null ? "" : name.replaceAll("[^A-Za-z0-9._-]", "-");
        String ext = mime != null && mime.contains("webm") ? ".webm" : ".mp4";
        if (!n.endsWith(ext)) n = n + ext;
        return n.length() > 80 ? n.substring(n.length() - 80) : n;
    }

    private static String mimeOf(File f) {
        return f.getName().endsWith(".webm") ? "video/webm" : "video/mp4";
    }

    private void saveInBackground() {
        new Thread(new Runnable() {
            @Override
            public void run() {
                File f;
                synchronized (videoLock) {
                    f = readyVideo;
                }
                videoSaved(f != null && writeToGallery(f));
            }
        }).start();
    }

    private static void copy(InputStream in, OutputStream out) throws IOException {
        byte[] buf = new byte[1 << 16];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
    }

    private boolean writeToGallery(File src) {
        String mime = mimeOf(src);
        if (Build.VERSION.SDK_INT >= 29) {
            // Android 10+: add it to Movies/Filmstrip through MediaStore, no permission needed.
            // These column names are newer than the SDK this compiles against.
            ContentResolver cr = getContentResolver();
            ContentValues v = new ContentValues();
            v.put(MediaStore.MediaColumns.DISPLAY_NAME, src.getName());
            v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
            v.put("relative_path", Environment.DIRECTORY_MOVIES + "/Filmstrip");
            v.put("is_pending", 1);
            Uri uri = null;
            try {
                uri = cr.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, v);
                if (uri == null) return false;
                OutputStream out = cr.openOutputStream(uri);
                if (out == null) throw new IOException("no stream");
                try (InputStream in = new FileInputStream(src)) {
                    copy(in, out);
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
        // Android 7–9: copy the file into Movies/Filmstrip and tell the gallery.
        try {
            File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES), "Filmstrip");
            if (!dir.isDirectory() && !dir.mkdirs()) return false;
            File f = new File(dir, src.getName());
            try (InputStream in = new FileInputStream(src); OutputStream out = new FileOutputStream(f)) {
                copy(in, out);
            }
            MediaScannerConnection.scanFile(this, new String[] {f.getAbsolutePath()}, new String[] {mime}, null);
            return true;
        } catch (IOException e) {
            return false;
        }
    }

    /** Serves assets/ at https://appassets.androidplatform.net/ and keeps other links out of the app. */
    private final class AppClient extends WebViewClient {
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

    /** The file pickers, and camera/microphone access after Android's own prompt. */
    private final class ChromeClient extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (pendingPick != null) pendingPick.onReceiveValue(null);
            pendingPick = callback;

            // accept="image/*,video/*" may arrive as one string or several.
            Set<String> types = new LinkedHashSet<>();
            String[] accept = params.getAcceptTypes();
            if (accept != null) {
                for (String a : accept) {
                    if (a == null) continue;
                    for (String t : a.split(",")) {
                        t = t.trim();
                        if (t.contains("/")) types.add(t);
                    }
                }
            }
            Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
            pick.addCategory(Intent.CATEGORY_OPENABLE);
            if (types.size() == 1) {
                pick.setType(types.iterator().next());
            } else {
                pick.setType("*/*");
                if (!types.isEmpty()) pick.putExtra(Intent.EXTRA_MIME_TYPES, types.toArray(new String[0]));
            }
            if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) {
                pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            }
            try {
                startActivityForResult(Intent.createChooser(pick, null), PICK_FILES);
                return true;
            } catch (Exception e) {
                pendingPick = null;
                return false;
            }
        }

        @Override
        public void onPermissionRequest(final PermissionRequest request) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (!ASSET_HOST.equals(request.getOrigin().getHost())) {
                        request.deny();
                        return;
                    }
                    List<String> ask = new ArrayList<>();
                    for (String r : request.getResources()) {
                        if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r) && !has(Manifest.permission.CAMERA)) {
                            ask.add(Manifest.permission.CAMERA);
                        }
                        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r) && !has(Manifest.permission.RECORD_AUDIO)) {
                            ask.add(Manifest.permission.RECORD_AUDIO);
                        }
                    }
                    if (ask.isEmpty()) {
                        grantWhatWeCan(request);
                        return;
                    }
                    if (pendingMedia != null) pendingMedia.deny();
                    pendingMedia = request;
                    requestPermissions(ask.toArray(new String[0]), ASK_MEDIA);
                }
            });
        }

        @Override
        public void onPermissionRequestCanceled(PermissionRequest request) {
            if (request == pendingMedia) pendingMedia = null;
        }
    }

    /** Exposed to the page as window.AndroidHost. Called on a WebView background thread. */
    private final class Bridge {
        @JavascriptInterface
        public void setOverlay(boolean open) {
            overlayOpen = open;
        }

        /** Keeps the screen on while recording or saving. */
        @JavascriptInterface
        public void keepAwake(final boolean on) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                }
            });
        }

        /** Starts receiving a finished video. Only the latest one is kept. */
        @JavascriptInterface
        public boolean beginVideo(String name, String mime) {
            synchronized (videoLock) {
                closeQuietly();
                readyVideo = null;
                clearVideos();
                try {
                    videoFile = new File(videoDir(), safeName(name, mime));
                    videoOut = new FileOutputStream(videoFile);
                    return true;
                } catch (IOException e) {
                    videoFile = null;
                    return false;
                }
            }
        }

        /** The next piece of the video, base64-encoded. */
        @JavascriptInterface
        public boolean appendVideo(String base64) {
            synchronized (videoLock) {
                if (videoOut == null) return false;
                try {
                    videoOut.write(Base64.decode(base64, Base64.DEFAULT));
                    return true;
                } catch (Exception e) {
                    closeQuietly();
                    return false;
                }
            }
        }

        @JavascriptInterface
        public boolean endVideo() {
            synchronized (videoLock) {
                if (videoOut == null) return false;
                try {
                    videoOut.close();
                    videoOut = null;
                    readyVideo = videoFile;
                    return true;
                } catch (IOException e) {
                    closeQuietly();
                    return false;
                }
            }
        }

        private void closeQuietly() {
            if (videoOut != null) {
                try {
                    videoOut.close();
                } catch (IOException e) {
                    // nothing to do
                }
            }
            videoOut = null;
        }

        /** Copies the received video to the gallery; answers later with a video-saved message. */
        @JavascriptInterface
        public boolean saveVideo() {
            synchronized (videoLock) {
                if (readyVideo == null) return false;
            }
            if (Build.VERSION.SDK_INT < 29 && !has(Manifest.permission.WRITE_EXTERNAL_STORAGE)) {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        requestPermissions(new String[] {Manifest.permission.WRITE_EXTERNAL_STORAGE}, ASK_STORAGE);
                    }
                });
                return true;
            }
            saveInBackground();
            return true;
        }

        /** Opens the share sheet for the received video. */
        @JavascriptInterface
        public boolean shareVideo() {
            final File f;
            synchronized (videoLock) {
                f = readyVideo;
            }
            if (f == null) return false;
            Uri uri = VideoProvider.uriFor(f.getName());
            final Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(mimeOf(f));
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
        }
    }
}
