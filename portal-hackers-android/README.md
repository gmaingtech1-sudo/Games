# Portal Hackers: Nexus for Android

Portal Hackers: Nexus as a regular Android app: download the APK, install it, and it gets its own icon on your home screen. No app store, and no HTTPS hosting needed for GPS.

**Download:** [`dist/portal-hackers.apk`](dist/portal-hackers.apk) (about 430 KB)

## Installing it

1. Open the APK on your phone (from your browser's downloads, the Files app, or wherever you downloaded it).
2. Android will say it can't install apps from that source. Tap **Settings**, turn on **Allow from this source**, and go back.
3. Tap **Install**. If Play Protect warns that it doesn't recognize the app, tap **More details → Install anyway**. It often warns about apps that don't come from the Play Store.
4. Open **Portal Hackers**, sign up, pick your team and avatar, then tap **Use my location**. Android asks once for location access. If you say no, you tap the compass to walk instead. You can turn location on later in **Settings → Apps → Portal Hackers → Permissions**.

Works on Android 7.0 and newer, as long as Android System WebView is up to date (the Play Store updates it automatically). On phones with a compass sensor the radar turns with the phone; without one, north stays up.

**Updating:** install a newer APK right over the old one. Your progress stays, because every build is signed with the same key (`signing.keystore`). Uninstalling the app deletes your progress.

## What's in it

It's the same game as the web version in [`../portal-hackers`](../portal-hackers), packaged into a small native app:

- The game files are inside the APK. The app serves them to its WebView from a private `https://appassets.androidplatform.net/` address, which counts as a secure page, so GPS works without hosting. Only the fonts come from Google Fonts, and it falls back to the phone's font without a connection.
- Your location stays on the phone.
- Your accounts and progress are saved in the app's own storage.
- Team chat needs the internet; it connects phones through PeerJS's public server, then directly.
- The screen stays on while you play.
- The back button aborts a hack or closes a panel before it leaves the app.

| File | What it does |
| --- | --- |
| `src/app/portalhackers/game/MainActivity.java` | The native side: WebView setup, serving the game files, location permission, back button |
| `AndroidManifest.xml` | App name, icon, permissions (location, internet for fonts and team chat, vibration), portrait screen |
| `res/` | Launcher icons (including the Android 8+ adaptive icon and the Android 13+ themed icon) and the dark theme |
| `build.sh` | Builds `dist/portal-hackers.apk` |
| `signing.keystore` | The key the APK is signed with (password `portalhackers`, alias `portalhackers`) |

## Building it

```sh
sudo apt install openjdk-21-jdk-headless aapt dalvik-exchange zipalign apksigner android-sdk-platform-23 zip
./build.sh
```

It copies the current game from `../portal-hackers`, so rebuild after changing the game.
