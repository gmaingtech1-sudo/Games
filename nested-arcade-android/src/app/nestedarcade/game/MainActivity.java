package app.nestedarcade.game;

import android.app.Activity;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Vibrator;
import android.view.View;
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
 * Nested Arcade for Android: one full-screen WebView running the web game
 * from ../nested-arcade, which ships inside the APK under assets/game.
 *
 * The files are served from a private https address so the page gets a
 * normal secure origin (and working localStorage for high scores) without
 * any network access. window.AndroidHost lets the game drive the vibration
 * motor and tell the app whether the back button should go to the game
 * (to step out of an inner game, close the prize counter or pause).
 */
public class MainActivity extends Activity {

    // Reserved for apps to serve their own files; it never reaches the network.
    private static final String ASSET_HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + ASSET_HOST + "/game/index.html";
    private static final int SHELL = Color.rgb(0x0B, 0x08, 0x16);

    private WebView web;
    private Vibrator vibrator;
    private volatile boolean gameWantsBack;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);

        web = new WebView(this);
        web.setBackgroundColor(SHELL);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        web.setOnLongClickListener(new View.OnLongClickListener() {
            @Override
            public boolean onLongClick(View v) {
                return true; // holding to steer must not select text
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
    }

    @Override
    protected void onPause() {
        // Stop the arcade clock while the app is in the background.
        web.evaluateJavascript("window.NestedArcade && NestedArcade.pause();", null);
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
        if (gameWantsBack) {
            web.evaluateJavascript("window.NestedArcade && NestedArcade.back();", null);
            return;
        }
        super.onBackPressed();
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
            return !ASSET_HOST.equals(Uri.parse(url).getHost());
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
            return "application/octet-stream";
        }
    }

    /** Exposed to the page as window.AndroidHost. Called on a WebView background thread. */
    private final class Bridge {
        @JavascriptInterface
        public void setCanGoBack(boolean wants) {
            gameWantsBack = wants;
        }

        @JavascriptInterface
        public void haptic(int ms) {
            if (vibrator == null || !vibrator.hasVibrator()) return;
            if (Build.VERSION.SDK_INT >= 29 && ms <= 10 && tick(ms <= 4 ? 2 : 0)) return;
            vibrator.vibrate(Math.max(5, Math.min(ms, 80)));
        }

        // Android 10+ has tuned tick/click effects that feel better than raw
        // buzzes for tiny taps. The APK compiles against an older SDK, so
        // reach them by reflection: VibrationEffect.createPredefined(id).
        private boolean tick(int id) {
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
