package app.portalhackers.game;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.widget.FrameLayout;
import android.view.WindowManager;
import android.webkit.GeolocationPermissions;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
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
 * Portal Hackers: Nexus for Android: one full-screen WebView running the web
 * game.
 *
 * The game files ship in the APK under assets/game and are served from a
 * private https address, so the page gets a normal secure origin (which GPS
 * requires) without needing the internet. The save lives in the WebView's
 * own storage for that origin. The page asks for location through the
 * standard geolocation API; this activity answers with Android's own
 * location permission prompt.
 */
public class MainActivity extends Activity {

    // Reserved for apps to serve their own files; it never reaches the network.
    private static final String ASSET_HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + ASSET_HOST + "/game/index.html";
    private static final int NIGHT = Color.rgb(0x03, 0x08, 0x14);

    private static final int ASK_LOCATION = 1;

    // Closes the hack puzzle or an open panel; says whether it did.
    private static final String BACK_JS =
            "(function(){try{if(PH.hack.running){PH.hack.cancel();return true;}"
            + "if(PH.ui.isOpen()){PH.ui.close();return true;}}catch(e){}return false;})()";

    private WebView web;

    // The page's location request, held while Android asks the player.
    private GeolocationPermissions.Callback pendingGeo;
    private String pendingGeoOrigin;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // You're watching the compass the whole time; don't let it dim.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = new WebView(this);
        web.setBackgroundColor(NIGHT);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
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
        s.setGeolocationEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setTextZoom(100);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);

        web.setWebViewClient(new GameClient());
        web.setWebChromeClient(new LocationClient());

        // Android 15+ draws every app edge to edge, under the status bar,
        // the navigation bar and the keyboard. Pad the game in by those
        // insets so nothing hides behind them (and the chat box stays above
        // the keyboard); the frame's dark background fills the bars.
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(NIGHT);
        root.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        root.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
            @Override
            @SuppressWarnings("deprecation")
            public WindowInsets onApplyWindowInsets(View v, WindowInsets in) {
                v.setPadding(in.getSystemWindowInsetLeft(), in.getSystemWindowInsetTop(),
                        in.getSystemWindowInsetRight(), in.getSystemWindowInsetBottom());
                return in.consumeSystemWindowInsets();
            }
        });
        setContentView(root);
        web.loadUrl(START_URL);
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onPause() {
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
        // Abort a hack or close a panel before leaving the app.
        web.evaluateJavascript(BACK_JS, new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String handled) {
                if (!"true".equals(handled)) MainActivity.super.onBackPressed();
            }
        });
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        if (code != ASK_LOCATION || pendingGeo == null) return;
        boolean granted = false;
        for (int r : results) if (r == PackageManager.PERMISSION_GRANTED) granted = true;
        // Not remembered: the page asks again next launch, and Android answers
        // straight away once the app has the permission.
        pendingGeo.invoke(pendingGeoOrigin, granted, false);
        pendingGeo = null;
        pendingGeoOrigin = null;
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

    /** Lets the page use GPS, after Android's own permission prompt. */
    private final class LocationClient extends WebChromeClient {
        @Override
        public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
            if (!ASSET_HOST.equals(Uri.parse(origin).getHost())) {
                callback.invoke(origin, false, false);
                return;
            }
            if (hasLocation()) {
                callback.invoke(origin, true, false);
                return;
            }
            pendingGeo = callback;
            pendingGeoOrigin = origin;
            requestPermissions(new String[] {
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION}, ASK_LOCATION);
        }
    }
}
