package app.neonbreak.game;

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
 * Neon Break for Android: one full-screen WebView running the web game.
 *
 * The game files ship in the APK under assets/game and are served from a
 * private https address, so it all works offline. window.AndroidHost is the
 * bridge the game looks for: it keeps the save in SharedPreferences and drives
 * the vibration motor. The back button asks the game first (NB.back()), and
 * switching away pauses the game.
 */
public class MainActivity extends Activity {

    // Reserved for apps to serve their own files; it never reaches the network.
    private static final String ASSET_HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + ASSET_HOST + "/game/index.html";
    private static final String SAVE_KEY = "neon-break-save-v1";
    private static final int NIGHT = Color.rgb(0x0B, 0x08, 0x20);

    private WebView web;
    private SharedPreferences prefs;
    private Vibrator vibrator;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("neon-break", MODE_PRIVATE);
        vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        goFullScreen();

        web = new WebView(this);
        web.setBackgroundColor(NIGHT);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        // Long presses are for aiming, not text selection.
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

    @SuppressWarnings("deprecation")
    private void goFullScreen() {
        // Hide the status and navigation bars; a swipe from the edge brings them back briefly.
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) goFullScreen();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        js("window.NB && NB.onResume && NB.onResume()");
    }

    @Override
    protected void onPause() {
        js("window.NB && NB.onPause && NB.onPause()"); // pauses the match and saves
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        // Let the game close a menu or pause first; leave the app only from the main menu.
        web.evaluateJavascript("(window.NB && NB.back) ? NB.back() : false", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String handled) {
                if (!"true".equals(handled)) finish();
            }
        });
    }

    private void js(String code) {
        if (web != null) web.evaluateJavascript(code, null);
    }

    /** Called from the game's JavaScript (on a background thread). */
    private final class Bridge {
        @JavascriptInterface
        public String load() {
            return prefs.getString(SAVE_KEY, null);
        }

        @JavascriptInterface
        public void save(String data) {
            if (data != null && data.length() < 100000) prefs.edit().putString(SAVE_KEY, data).apply();
        }

        @JavascriptInterface
        @SuppressWarnings("deprecation")
        public void vibrate(int ms) {
            if (vibrator == null || !vibrator.hasVibrator()) return;
            long len = Math.max(1, Math.min(ms, 400));
            if (Build.VERSION.SDK_INT >= 26) {
                // VibrationEffect.createOneShot(len, amplitude), reached by reflection because
                // the APK compiles against an older SDK. Short taps get a softer amplitude.
                int amp = len < 15 ? 90 : len < 40 ? 160 : 255;
                try {
                    Class<?> effectClass = Class.forName("android.os.VibrationEffect");
                    Object effect = effectClass.getMethod("createOneShot", long.class, int.class).invoke(null, len, amp);
                    Vibrator.class.getMethod("vibrate", effectClass).invoke(vibrator, effect);
                    return;
                } catch (Exception e) {
                    // fall through to the plain buzz
                }
            }
            vibrator.vibrate(len);
        }
    }

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
            if (path.endsWith(".webmanifest") || path.endsWith(".json")) return "application/json";
            return "application/octet-stream";
        }
    }
}
