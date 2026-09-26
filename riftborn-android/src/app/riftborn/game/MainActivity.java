package app.riftborn.game;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Vibrator;
import android.view.View;
import android.view.WindowManager;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;

/**
 * Riftborn for Android: one full-screen WebView running the web game.
 *
 * The game files ship in the APK under assets/game and are served from a
 * private https address, so the page gets a normal secure origin (which GPS
 * and the camera require) without a web server. Map tiles and fonts still
 * come from the internet. window.AndroidHost is the bridge the game's
 * js/host.js looks for: it keeps saves, accounts and the login session in
 * SharedPreferences, drives the vibration motor, and reaches the clipboard
 * for the game's Copy and Paste buttons. The activity sends back pause,
 * resume and back messages, and asks Android for location and camera
 * access when the page wants them.
 */
public class MainActivity extends Activity {

    // Reserved for apps to serve their own files; it never reaches the network.
    private static final String ASSET_HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + ASSET_HOST + "/game/index.html";
    private static final int NIGHT = Color.rgb(0x0B, 0x07, 0x16);

    private static final int ASK_CAMERA = 1;
    private static final int ASK_LOCATION = 2;

    private WebView web;
    private SharedPreferences prefs;
    private Vibrator vibrator;
    private ClipboardManager clipboard;
    private volatile boolean overlayOpen;

    // Page requests held while Android asks the player.
    private PermissionRequest pendingCamera;
    private GeolocationPermissions.Callback pendingLocation;
    private String pendingLocationOrigin;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("riftborn", MODE_PRIVATE);
        vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
        clipboard = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
        // You're walking around looking at the map; don't let the screen dim.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = new WebView(this);
        web.setBackgroundColor(NIGHT);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        // Long presses and drags belong to the game, not text selection,
        // except in text boxes, where a long press brings up Paste.
        web.setOnLongClickListener(new View.OnLongClickListener() {
            @Override
            public boolean onLongClick(View v) {
                WebView.HitTestResult hit = web.getHitTestResult();
                return hit == null || hit.getType() != WebView.HitTestResult.EDIT_TEXT_TYPE;
            }
        });
        web.setLongClickable(false);
        web.setHapticFeedbackEnabled(false);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setGeolocationEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setTextZoom(100);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);

        web.setWebViewClient(new GameClient());
        web.setWebChromeClient(new PermissionsClient());
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
        // Close a panel or leave an encounter first.
        if (overlayOpen) {
            send("{t: 'back'}");
            return;
        }
        super.onBackPressed();
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        boolean granted = false;
        for (int r : results) granted |= r == PackageManager.PERMISSION_GRANTED;
        if (code == ASK_CAMERA && pendingCamera != null) {
            if (granted) pendingCamera.grant(new String[] {PermissionRequest.RESOURCE_VIDEO_CAPTURE});
            else pendingCamera.deny(); // the game shows its rift plain instead
            pendingCamera = null;
        } else if (code == ASK_LOCATION && pendingLocation != null) {
            // Don't remember a "no", so Try again in the game can ask again.
            pendingLocation.invoke(pendingLocationOrigin, granted, granted);
            pendingLocation = null;
            pendingLocationOrigin = null;
        }
    }

    private void send(final String msg) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                web.evaluateJavascript("window.RB && RB.host && RB.host.receive(" + msg + ");", null);
            }
        });
    }

    private boolean hasLocation() {
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    /** Serves assets/ at https://appassets.androidplatform.net/ and keeps other links out of the app. */
    private final class GameClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri url = request.getUrl();
            if (!ASSET_HOST.equals(url.getHost())) return null; // map tiles, fonts
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
            if (path.endsWith(".rules")) return "text/plain";
            return "application/octet-stream";
        }
    }

    /** Passes the page's GPS and camera requests on to Android's own prompts. */
    private final class PermissionsClient extends WebChromeClient {
        @Override
        public void onGeolocationPermissionsShowPrompt(final String origin, final GeolocationPermissions.Callback callback) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (!ASSET_HOST.equals(Uri.parse(origin).getHost())) {
                        callback.invoke(origin, false, false);
                        return;
                    }
                    if (hasLocation()) {
                        callback.invoke(origin, true, true);
                        return;
                    }
                    if (pendingLocation != null) pendingLocation.invoke(pendingLocationOrigin, false, false);
                    pendingLocation = callback;
                    pendingLocationOrigin = origin;
                    requestPermissions(new String[] {Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, ASK_LOCATION);
                }
            });
        }

        @Override
        public void onGeolocationPermissionsHidePrompt() {
            pendingLocation = null;
            pendingLocationOrigin = null;
        }

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
        // Key/value storage for saves, accounts and the login session.
        @JavascriptInterface
        public String getItem(String key) {
            return prefs.getString(key, null);
        }

        @JavascriptInterface
        public void setItem(String key, String value) {
            prefs.edit().putString(key, value).apply();
        }

        @JavascriptInterface
        public void removeItem(String key) {
            prefs.edit().remove(key).apply();
        }

        @JavascriptInterface
        public void setOverlay(boolean open) {
            overlayOpen = open;
        }

        // The game's Copy button (the Firestore rules for online accounts).
        @JavascriptInterface
        public void copyText(final String text) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    clipboard.setPrimaryClip(ClipData.newPlainText("Riftborn", text));
                }
            });
        }

        // The game's Paste buttons. Android only shares the clipboard with
        // the app on screen, which is us when the player taps Paste.
        @JavascriptInterface
        public String pasteText() {
            try {
                ClipData clip = clipboard.getPrimaryClip();
                if (clip == null || clip.getItemCount() == 0) return "";
                CharSequence text = clip.getItemAt(0).coerceToText(MainActivity.this);
                return text == null ? "" : text.toString();
            } catch (RuntimeException e) {
                return ""; // the game asks for a long press instead
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

        // Android 10+ has tuned "tick"/"click" effects. The APK compiles
        // against an older SDK, so reach them by reflection.
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
