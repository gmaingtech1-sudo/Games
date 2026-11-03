package com.bodyos.beyondexistence;

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
 * BODY.OS: BEYOND EXISTENCE for Android: one full-screen, landscape WebView running the
 * game. The game files ship in the APK under assets/game and are served from a private
 * https address, so the page gets a normal secure origin and needs no internet at all.
 *
 * window.AndroidHost is the bridge the game's js/host.js looks for: it stores saves and
 * settings in SharedPreferences, drives the vibration motor and lets the game quit.
 * The activity sends pause, resume and back messages to BOS.host.receive().
 */
public class MainActivity extends Activity {

    // Reserved for apps to serve their own files; it never reaches the network.
    private static final String ASSET_HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + ASSET_HOST + "/game/index.html";
    private static final int SPACE = Color.rgb(0x02, 0x04, 0x0A);

    private WebView web;
    private SharedPreferences prefs;
    private Vibrator vibrator;
    private volatile boolean backToGame;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("bodyos", MODE_PRIVATE);
        vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        useDisplayCutout();

        web = new WebView(this);
        web.setBackgroundColor(SPACE);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        // Long presses belong to the game controls, not text selection.
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
        immersive();
        web.loadUrl(START_URL);
    }

    /** Draw into the notch area in landscape (Android 9+); the game keeps UI inside the safe area. */
    private void useDisplayCutout() {
        if (Build.VERSION.SDK_INT < 28) return;
        try {
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            WindowManager.LayoutParams.class.getField("layoutInDisplayCutoutMode").setInt(lp, 1); // SHORT_EDGES
            getWindow().setAttributes(lp);
        } catch (Exception e) {
            // Older devices simply letterbox around the cut-out.
        }
    }

    /** Full-screen: hide the status and navigation bars; a swipe brings them back briefly. */
    @SuppressWarnings("deprecation")
    private void immersive() {
        web.setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) immersive();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        immersive();
        send("resume");
    }

    @Override
    protected void onPause() {
        send("pause"); // the game saves right away
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
        // In game or with a menu open, Back closes the top menu or pauses; on the title screen it exits.
        if (backToGame) {
            send("back");
            return;
        }
        super.onBackPressed();
    }

    private void send(String type) {
        web.evaluateJavascript("window.BOS && BOS.host && BOS.host.receive({t: '" + type + "'});", null);
    }

    /** Serves assets/ at https://appassets.androidplatform.net/ and keeps other links out of the app. */
    private final class GameClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri url = request.getUrl();
            if (!ASSET_HOST.equals(url.getHost())) return null;
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
                // No app can open it: ignore.
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
            if (path.endsWith(".json")) return "application/json";
            return "application/octet-stream";
        }
    }

    /** Exposed to the page as window.AndroidHost. Called on a WebView background thread. */
    private final class Bridge {
        @JavascriptInterface
        public String loadSave(String key) {
            return prefs.getString(key, null);
        }

        @JavascriptInterface
        public void writeSave(String key, String json) {
            // commit(): the save is on disk before we return, even if Android kills the app next.
            prefs.edit().putString(key, json).commit();
        }

        @JavascriptInterface
        public void clearSave(String key) {
            prefs.edit().remove(key).commit();
        }

        @JavascriptInterface
        public void setOverlay(boolean inGameOrMenuOpen) {
            backToGame = inGameOrMenuOpen;
        }

        @JavascriptInterface
        public void quit() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    finish();
                }
            });
        }

        @JavascriptInterface
        @SuppressWarnings("deprecation")
        public void haptic(String style) {
            if (vibrator == null || !vibrator.hasVibrator()) return;
            if (Build.VERSION.SDK_INT >= 29 && playPredefined(style)) return;
            if ("success".equals(style)) vibrator.vibrate(new long[] {0, 18, 70, 18}, -1);
            else if ("light".equals(style)) vibrator.vibrate(14);
            else if ("medium".equals(style)) vibrator.vibrate(24);
            else vibrator.vibrate(45);
        }

        // Android 10+ tuned click effects, reached by reflection (the APK compiles against an older SDK).
        private boolean playPredefined(String style) {
            int id;
            if ("light".equals(style)) id = 0;          // EFFECT_CLICK
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
