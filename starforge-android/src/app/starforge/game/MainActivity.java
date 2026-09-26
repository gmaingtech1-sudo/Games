package app.starforge.game;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Vibrator;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * Starforge for Android: one full-screen WebView running the web game.
 *
 * The game files ship in the APK under assets/game and are served from a
 * private https address, so the page gets a normal secure origin without
 * needing the internet. window.AndroidHost is the bridge the game's
 * js/host.js looks for: it stores the save in SharedPreferences, drives the
 * vibration motor and hides the system bars while you fly. The activity
 * sends back pause, resume and back.
 */
public class MainActivity extends Activity {

    // Reserved for apps to serve their own files; it never reaches the network.
    private static final String ASSET_HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + ASSET_HOST + "/game/index.html";
    private static final String SAVE_KEY = "starforge-save-v1";
    private static final int SPACE = Color.rgb(0x04, 0x05, 0x0E);

    private static final int IMMERSIVE_FLAGS = View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY;

    private WebView web;
    private SharedPreferences prefs;
    private Vibrator vibrator;
    private volatile boolean overlayOpen;
    private volatile boolean immersive;
    private boolean paused;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("starforge", MODE_PRIVATE);
        vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
        // A shooter is all dragging: don't let the screen dim mid-fight.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = new WebView(this);
        web.setBackgroundColor(SPACE);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        // Long presses are part of flying, not text selection.
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
        web.addJavascriptInterface(new Bridge(), "AndroidHost");
        setContentView(web);
        web.loadUrl(START_URL);
    }

    @Override
    protected void onResume() {
        super.onResume();
        paused = false;
        web.onResume();
        web.resumeTimers();
        applySystemUi();
        send("resume");
    }

    @Override
    protected void onPause() {
        paused = true;
        // Let the game pause the flight and silence the sound, then freeze
        // its timers so nothing runs in the background.
        web.evaluateJavascript(message("pause"), new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String value) {
                if (paused) web.pauseTimers();
            }
        });
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) applySystemUi();
    }

    @Override
    public void onBackPressed() {
        // Close a sheet, or pause/resume the flight, before leaving the app.
        if (overlayOpen) {
            send("back");
            return;
        }
        super.onBackPressed();
    }

    private void applySystemUi() {
        web.setSystemUiVisibility(immersive ? IMMERSIVE_FLAGS : 0);
    }

    private void send(String type) {
        web.evaluateJavascript(message(type), null);
    }

    private static String message(String type) {
        return "window.SF && SF.host && SF.host.receive({t: '" + type + "'});";
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

        @JavascriptInterface
        public void setImmersive(final boolean on) {
            immersive = on;
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    applySystemUi();
                }
            });
        }

        @JavascriptInterface
        public void haptic(String style) {
            if (vibrator == null || !vibrator.hasVibrator()) return;
            if (Build.VERSION.SDK_INT >= 29 && playPredefined(style)) return;
            if ("selection".equals(style)) {
                vibrator.vibrate(8);
            } else if ("light".equals(style)) {
                vibrator.vibrate(14);
            } else if ("medium".equals(style)) {
                vibrator.vibrate(26);
            } else {
                vibrator.vibrate(new long[] {0, 60, 40, 110}, -1);
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
            else return false;                          // heavy: explosions want a real rumble
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
