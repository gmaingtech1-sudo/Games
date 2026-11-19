package app.hyperdot.game;

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

import org.json.JSONArray;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * Hyperdot for Android: one full-screen WebView running the web game.
 *
 * The game files ship in the APK under assets/game and are served from a
 * private https address, so the game works without the internet.
 * window.AndroidHost is the bridge the game's js/core.js looks for: it keeps
 * the save in SharedPreferences and drives the vibration motor. The back
 * button asks the game to step back a screen before it leaves the app.
 */
public class MainActivity extends Activity {

    // Reserved for apps to serve their own files; it never reaches the network.
    private static final String ASSET_HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + ASSET_HOST + "/game/index.html";
    private static final int NIGHT = Color.rgb(0x07, 0x09, 0x17);

    private WebView web;
    private SharedPreferences prefs;
    private Vibrator vibrator;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("hyperdot", MODE_PRIVATE);
        vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
        // Puzzles take thinking time; don't let the screen dim mid-thought.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = new WebView(this);
        web.setBackgroundColor(NIGHT);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        // Holding a move button repeats the move; don't select text instead.
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
        web.onResume();
        run("window.HD && HD.audio && HD.audio.suspend(false)", null);
    }

    @Override
    protected void onPause() {
        run("window.HD && HD.audio && HD.audio.suspend(true)", null);
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
        // Close a sheet or card, or go back a screen; leave from the title.
        run("(function () { try { return !!(window.HD && HD.ui && HD.ui.back()); } catch (e) { return false; } })()",
                new ValueCallback<String>() {
                    @Override
                    public void onReceiveValue(String handled) {
                        if (!"true".equals(handled)) finish();
                    }
                });
    }

    private void run(final String js, final ValueCallback<String> then) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                web.evaluateJavascript(js, then);
            }
        });
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
        public String load(String key) {
            return prefs.getString(key, null);
        }

        @JavascriptInterface
        public void save(String key, String json) {
            prefs.edit().putString(key, json).apply();
        }

        @JavascriptInterface
        public void remove(String key) {
            prefs.edit().remove(key).apply();
        }

        /** A JSON list of milliseconds: buzz, pause, buzz… like navigator.vibrate. */
        @JavascriptInterface
        public void vibrate(String pattern) {
            if (vibrator == null || !vibrator.hasVibrator()) return;
            long[] ms;
            try {
                JSONArray a = new JSONArray(pattern);
                if (a.length() == 0 || a.length() > 16) return;
                ms = new long[a.length()];
                for (int i = 0; i < a.length(); i++) ms[i] = Math.max(0, Math.min(400, a.getLong(i)));
            } catch (Exception e) {
                return;
            }
            // A single short buzz feels best as the phone's tuned click (Android 10+).
            if (ms.length == 1 && ms[0] <= 15 && Build.VERSION.SDK_INT >= 29 && playPredefined(ms[0] <= 9 ? 2 : 0)) return;
            if (ms.length == 1) {
                vibrator.vibrate(ms[0]);
            } else {
                // navigator.vibrate patterns start with a buzz; Vibrator patterns start with a pause.
                long[] p = new long[ms.length + 1];
                System.arraycopy(ms, 0, p, 1, ms.length);
                vibrator.vibrate(p, -1);
            }
        }

        // VibrationEffect.createPredefined(id), reached by reflection because
        // the APK compiles against an older SDK. 2 = EFFECT_TICK, 0 = EFFECT_CLICK.
        private boolean playPredefined(int id) {
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
