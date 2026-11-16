package app.rollmancer.game;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Vibrator;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.widget.FrameLayout;
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
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.util.HashMap;
import java.util.Map;

/**
 * Rollmancer for Android: one full-screen WebView running the web game.
 *
 * The game files ship in the APK under assets/game and are served from a
 * private https address, so the game runs fully offline with a normal
 * secure origin. The app needs no permissions at all, not even internet:
 * fonts, art and sound are all inside it. window.AndroidHost is the bridge
 * the game's js/profile.js looks for: it keeps the save in
 * SharedPreferences, drives the vibration motor and opens the share sheet.
 * The back button and pause/resume are passed to the game (RM.onBack,
 * RM.onPause, RM.onResume).
 */
public class MainActivity extends Activity {

    // Reserved for apps to serve their own files; it never reaches the network.
    private static final String ASSET_HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + ASSET_HOST + "/game/index.html";
    private static final String SAVE_KEY = "rollmancer-save-v1";
    private static final int NIGHT = Color.rgb(0x12, 0x0C, 0x1F);

    private WebView web;
    private SharedPreferences prefs;
    private Vibrator vibrator;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("rollmancer", MODE_PRIVATE);
        vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
        Window w = getWindow();
        w.setStatusBarColor(NIGHT);
        w.setNavigationBarColor(NIGHT);

        web = new WebView(this);
        web.setBackgroundColor(NIGHT);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        // Long presses belong to the game, not text selection.
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

        // Android 15+ draws apps edge to edge. Pad the game clear of the
        // status and navigation bars, which show the night colour behind.
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(NIGHT);
        root.addView(web, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        root.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
            @Override
            @SuppressWarnings("deprecation")
            public WindowInsets onApplyWindowInsets(View v, WindowInsets insets) {
                v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                        insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
                return insets.consumeSystemWindowInsets();
            }
        });
        setContentView(root);
        registerBackCallback();
        web.loadUrl(START_URL);
    }

    /**
     * Android 16 apps no longer get onBackPressed(); back arrives through an
     * OnBackInvokedCallback instead. That API is newer than the SDK this
     * compiles against, so it's registered by reflection.
     */
    private void registerBackCallback() {
        if (Build.VERSION.SDK_INT < 36) return;
        try {
            final Class<?> cbClass = Class.forName("android.window.OnBackInvokedCallback");
            Object cb = Proxy.newProxyInstance(cbClass.getClassLoader(), new Class<?>[] {cbClass},
                    new InvocationHandler() {
                        @Override
                        public Object invoke(Object proxy, Method method, Object[] args) {
                            if ("onBackInvoked".equals(method.getName())) handleBack(true);
                            else if ("hashCode".equals(method.getName())) return System.identityHashCode(proxy);
                            else if ("equals".equals(method.getName())) return proxy == args[0];
                            return null;
                        }
                    });
            Object dispatcher = Activity.class.getMethod("getOnBackInvokedDispatcher").invoke(this);
            Class<?> dClass = Class.forName("android.window.OnBackInvokedDispatcher");
            dClass.getMethod("registerOnBackInvokedCallback", int.class, cbClass).invoke(dispatcher, 0, cb);
        } catch (Exception e) {
            // older behaviour: onBackPressed() below
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        web.evaluateJavascript("window.RM && RM.onResume && RM.onResume();", null);
    }

    @Override
    protected void onPause() {
        // The game saves straight away and stops its music.
        web.evaluateJavascript("window.RM && RM.onPause && RM.onPause();", null);
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
        handleBack(false);
    }

    // The game closes its sheets, cancels a trinket or opens the pause menu
    // first; it answers false when there's nothing left to close, and then
    // the app goes to the background.
    private void handleBack(final boolean viaCallback) {
        web.evaluateJavascript("(window.RM && RM.onBack) ? RM.onBack() : false", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String handled) {
                if ("true".equals(handled)) return;
                if (viaCallback) moveTaskToBack(true);
                else MainActivity.super.onBackPressed();
            }
        });
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
                headers.put("Access-Control-Allow-Origin", "https://" + ASSET_HOST);
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
            if (path.endsWith(".woff2")) return "font/woff2";
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
        public void setOverlay(boolean open) {
            // Kept for symmetry with the other games; back is always asked of the page.
        }

        /** "tick", "click" or "heavy". Uses the phone's tuned effects on Android 10+. */
        @JavascriptInterface
        public void haptic(String style) {
            if (vibrator == null || !vibrator.hasVibrator()) return;
            if (Build.VERSION.SDK_INT >= 29) {
                // VibrationEffect is newer than the SDK this compiles against,
                // so call VibrationEffect.createPredefined(id) by reflection.
                int id = "tick".equals(style) ? 2 : "heavy".equals(style) ? 5 : 0;
                try {
                    Class<?> effectClass = Class.forName("android.os.VibrationEffect");
                    Object effect = effectClass.getMethod("createPredefined", int.class).invoke(null, id);
                    Vibrator.class.getMethod("vibrate", effectClass).invoke(vibrator, effect);
                    return;
                } catch (Exception e) {
                    // fall through to a plain buzz
                }
            }
            long ms = "tick".equals(style) ? 8 : "heavy".equals(style) ? 40 : 16;
            vibrator.vibrate(ms);
        }

        /** Opens the share sheet with a run result. */
        @JavascriptInterface
        public void share(String text) {
            final Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("text/plain");
            send.putExtra(Intent.EXTRA_TEXT, text);
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
        }
    }
}
