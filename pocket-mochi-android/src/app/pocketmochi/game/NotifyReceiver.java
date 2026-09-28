package app.pocketmochi.game;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/**
 * Fires the reminder MainActivity scheduled for while the app was closed
 * (e.g. "Mochi is hungry"). AlarmManager wakes the app just long enough to
 * run this and post the notification, then it's done again.
 */
public class NotifyReceiver extends BroadcastReceiver {

    static final String CHANNEL_ID = "pocket-mochi-needs";
    static final int NOTIFICATION_ID = 1;

    @Override
    public void onReceive(Context context, Intent intent) {
        String title = intent.getStringExtra("title");
        String body = intent.getStringExtra("body");
        if (title == null || body == null) return;

        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        ensureChannel(nm);

        Intent open = new Intent(context, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent tap = PendingIntent.getActivity(context, 0, open, flags);

        Notification.Builder b = newBuilder(context);
        b.setContentTitle(title)
                .setContentText(body)
                .setSmallIcon(R.mipmap.ic_launcher_monochrome)
                .setAutoCancel(true)
                .setContentIntent(tap);
        try {
            nm.notify(NOTIFICATION_ID, b.build());
        } catch (Exception e) {
            // permission revoked between scheduling and firing; nothing to do
        }
    }

    // The (Context, channelId) constructor is API 26+; the app compiles
    // against an older SDK (see build.sh), so it's reached by reflection.
    @SuppressWarnings("deprecation")
    private Notification.Builder newBuilder(Context context) {
        if (Build.VERSION.SDK_INT >= 26) {
            try {
                return Notification.Builder.class.getConstructor(Context.class, String.class).newInstance(context, CHANNEL_ID);
            } catch (Exception e) {
                // fall through to the older constructor
            }
        }
        return new Notification.Builder(context);
    }

    // NotificationChannel is API 26+; the app compiles against an older SDK
    // (see build.sh), so it's reached by reflection like the vibration effects.
    private void ensureChannel(NotificationManager nm) {
        if (Build.VERSION.SDK_INT < 26) return;
        try {
            Class<?> channelClass = Class.forName("android.app.NotificationChannel");
            Object existing = NotificationManager.class.getMethod("getNotificationChannel", String.class).invoke(nm, CHANNEL_ID);
            if (existing != null) return;
            Object channel = channelClass.getConstructor(String.class, CharSequence.class, int.class)
                    .newInstance(CHANNEL_ID, "Pet reminders", 3 /* IMPORTANCE_DEFAULT */);
            channelClass.getMethod("setDescription", String.class)
                    .invoke(channel, "Lets you know when your pet is hungry, bored, or awake");
            NotificationManager.class.getMethod("createNotificationChannel", channelClass).invoke(nm, channel);
        } catch (Exception e) {
            // best effort; the notification still shows, just without a named channel
        }
    }
}
