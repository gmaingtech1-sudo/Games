package app.pocketmochi.game;

import android.app.Activity;
import android.app.AlarmManager;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
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
 * Pocket Mochi for Android: one full-screen WebView running the web game.
 *
 * The game files ship in the APK under assets/game and are served from a
 * private https address, so the page gets a normal secure origin without
 * needing the internet. window.AndroidHost is the bridge the game's
 * js/host.js looks for: it stores the save in SharedPreferences and drives
 * the vibration motor. The activity sends back pause, resume and back.
 */
public class MainActivity extends Activity {

    // Reserved for apps to serve their own files; it never reaches the network.
    private static final String ASSET_HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + ASSET_HOST + "/game/index.html";
    private static final String SAVE_KEY = "pocket-mochi-save-v1";
    private static final int SHELL = Color.rgb(0x2A, 0x2C, 0x52);
    private static final String POST_NOTIFICATIONS = "android.permission.POST_NOTIFICATIONS";
    private static final int NOTIFY_ALARM_CODE = 1001;
    private static final int NOTIFY_PERMISSION_CODE = 1002;

    private WebView web;
    private SharedPreferences prefs;
    private Vibrator vibrator;
    private volatile boolean overlayOpen;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("pocket-mochi", MODE_PRIVATE);
        vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);

        web = new WebView(this);
        web.setBackgroundColor(SHELL);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        // Long presses belong to the game (stroking the pet), not text selection.
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
        // Close the shop, snack tray, washing or the mini-game first.
        if (overlayOpen) {
            send("back");
            return;
        }
        super.onBackPressed();
    }

    private void send(String type) {
        web.evaluateJavascript("window.PM && PM.host && PM.host.receive({t: '" + type + "'});", null);
    }

    private void send(String type, boolean flag) {
        web.evaluateJavascript("window.PM && PM.host && PM.host.receive({t: '" + type + "', granted: " + flag + "});", null);
    }

    // PendingIntent.FLAG_IMMUTABLE has been required for a pending intent that,
    // like this one, is never filled in with extra data later.
    private static int pendingFlags() {
        return PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != NOTIFY_PERMISSION_CODE) return;
        boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
        send("notifyPermission", granted);
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

        // A reminder for while the app is closed, e.g. "Mochi is hungry". Only
        // one is ever pending: scheduling again replaces it, matching how the
        // game only ever cares about the next thing the pet will need.
        @JavascriptInterface
        public void scheduleNotification(String title, String body, double minutes) {
            AlarmManager am = (AlarmManager) getSystemService(ALARM_SERVICE);
            if (am == null) return;
            Intent i = new Intent(MainActivity.this, NotifyReceiver.class);
            i.putExtra("title", title);
            i.putExtra("body", body);
            PendingIntent pi = PendingIntent.getBroadcast(MainActivity.this, NOTIFY_ALARM_CODE, i, pendingFlags());
            long at = System.currentTimeMillis() + Math.max(60000, Math.round(minutes * 60000));
            try {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            } catch (Exception e) {
                // some OEMs restrict alarms further; the reminder just won't fire
            }
        }

        @JavascriptInterface
        public void cancelNotification() {
            AlarmManager am = (AlarmManager) getSystemService(ALARM_SERVICE);
            if (am != null) {
                Intent i = new Intent(MainActivity.this, NotifyReceiver.class);
                am.cancel(PendingIntent.getBroadcast(MainActivity.this, NOTIFY_ALARM_CODE, i, pendingFlags()));
            }
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(NotifyReceiver.NOTIFICATION_ID);
        }

        // Whether the app can actually show a notification right now. Always
        // true before Android 13, which is the first to ask permission at all.
        @JavascriptInterface
        public boolean notifyPermission() {
            if (Build.VERSION.SDK_INT < 33) return true;
            return checkSelfPermission(POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
        }

        // Answers later with PM.host.receive({t:'notifyPermission', granted}),
        // since the system prompt's result isn't something a return value can carry.
        @JavascriptInterface
        public void requestNotifyPermission() {
            if (Build.VERSION.SDK_INT < 33 || checkSelfPermission(POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
                send("notifyPermission", true);
                return;
            }
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    MainActivity.this.requestPermissions(new String[] { POST_NOTIFICATIONS }, NOTIFY_PERMISSION_CODE);
                }
            });
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

        // Android 10+ has tuned "tick"/"click" effects that feel much better
        // than raw buzzes. The APK compiles against an older SDK, so reach them
        // by reflection: VibrationEffect.createPredefined(id).
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
