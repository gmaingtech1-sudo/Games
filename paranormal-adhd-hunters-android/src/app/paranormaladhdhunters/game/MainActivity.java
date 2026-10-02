package app.paranormaladhdhunters.game;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Vibrator;
import android.speech.tts.TextToSpeech;
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
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * ParanormalADHDhunters for Android: one full-screen WebView running the web game.
 *
 * The game files ship in the APK under assets/game and are served from a
 * private https address, so the page gets a normal secure origin (WebGL,
 * WebAudio and WebRTC all behave as in a browser) without needing the
 * internet. window.AndroidHost is the bridge the game's js/host.js looks for:
 * it drives the vibration motor, speaks spirit box answers with the phone's
 * text-to-speech, and keeps a copy of the save. The activity calls back into
 * the page for the back button and when the app goes to the background.
 */
public class MainActivity extends Activity {

    // Reserved for apps to serve their own files; it never reaches the network.
    private static final String ASSET_HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + ASSET_HOST + "/game/index.html";
    private static final String SAVE_KEY = "paranormaladhdhunters-save-v1";
    private static final int NIGHT = Color.rgb(0x05, 0x06, 0x0C);

    private WebView web;
    private SharedPreferences prefs;
    private Vibrator vibrator;
    private TextToSpeech tts;
    private volatile boolean ttsReady;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("paranormaladhdhunters", MODE_PRIVATE);
        vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
        // An investigation is all looking and listening; don't let the screen dim.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = new WebView(this);
        web.setBackgroundColor(NIGHT);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        // Long presses belong to the game (holding the joystick), not text selection.
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
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                request.deny(); // the game never needs the camera or microphone
            }
        });
        web.addJavascriptInterface(new Bridge(), "AndroidHost");
        setContentView(web);
        goFullscreen();
        web.loadUrl(START_URL);

        // The phone's own voice, for spirit box answers. It starts up in the background.
        tts = new TextToSpeech(this, new TextToSpeech.OnInitListener() {
            @Override
            public void onInit(int status) {
                ttsReady = status == TextToSpeech.SUCCESS;
            }
        });
    }

    @Override
    protected void onResume() {
        super.onResume();
        goFullscreen();
        web.resumeTimers();
        web.onResume();
        call("window.PAH_resume && window.PAH_resume()");
    }

    @Override
    protected void onPause() {
        call("window.PAH_pause && window.PAH_pause()"); // pauses a solo case and silences the audio
        web.onPause();
        web.pauseTimers();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (tts != null) tts.shutdown();
        web.destroy();
        super.onDestroy();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) goFullscreen();
    }

    /** Back closes menus or pauses an investigation first; from the main menu it leaves. */
    @Override
    public void onBackPressed() {
        web.evaluateJavascript("(window.PAH_back ? window.PAH_back() : false)", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String handled) {
                if (!"true".equals(handled)) finish();
            }
        });
    }

    private void call(String js) {
        web.evaluateJavascript(js, null);
    }

    /** Hides the status and navigation bars; a swipe from the edge brings them back for a moment. */
    @SuppressWarnings("deprecation")
    private void goFullscreen() {
        web.setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
    }

    /** Serves assets/ at https://appassets.androidplatform.net/ and keeps other links out of the app. */
    private final class GameClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri url = request.getUrl();
            if (!ASSET_HOST.equals(url.getHost())) return null; // Google Fonts and the team server
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
                startActivity(new Intent(Intent.ACTION_VIEW, uri)); // e.g. the three.js link in Settings
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
        public String loadSave() {
            return prefs.getString(SAVE_KEY, null);
        }

        @JavascriptInterface
        public void writeSave(String json) {
            prefs.edit().putString(SAVE_KEY, json).apply();
        }

        /** A length in ms ("60") or a pattern of on/off times ("[80,60,120]"). */
        @JavascriptInterface
        public void vibrate(String pattern) {
            if (vibrator == null || !vibrator.hasVibrator() || pattern == null) return;
            String p = pattern.replaceAll("[\\[\\]\\s]", "");
            if (p.isEmpty()) return;
            try {
                String[] parts = p.split(",");
                if (parts.length == 1) {
                    vibrator.vibrate(Math.min(1000, Long.parseLong(parts[0])));
                    return;
                }
                long[] times = new long[parts.length + 1]; // starts with a zero-length pause
                for (int i = 0; i < parts.length; i++) times[i + 1] = Math.min(1000, Long.parseLong(parts[i]));
                vibrator.vibrate(times, -1);
            } catch (NumberFormatException e) {
                // not a pattern we understand; skip it
            }
        }

        /** Speaks a spirit box answer. Returns false if the phone has no voice ready, so the page can try its own. */
        @JavascriptInterface
        public boolean speak(String text, float pitch, float rate) {
            if (!ttsReady || text == null) return false;
            tts.setPitch(Math.max(0.3f, Math.min(2f, pitch)));
            tts.setSpeechRate(Math.max(0.4f, Math.min(1.5f, rate)));
            return tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "spirit") == TextToSpeech.SUCCESS;
        }

        @JavascriptInterface
        public String platform() {
            return "android " + Build.VERSION.RELEASE;
        }
    }
}
