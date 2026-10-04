# Frontline 1944 for Android

The Frontline 1944 shooter as a regular Android app. Download the APK, install it, and it gets its own icon on your home screen. No app store needed.

**Download:** [`dist/frontline.apk`](dist/frontline.apk) (about 380 KB, version 1.1.0)

## Installing it

1. Open the APK on your phone (from your browser's downloads, the Files app, or wherever you downloaded it).
2. Android will say it can't install apps from that source. Tap **Settings**, turn on **Allow from this source**, and go back.
3. Tap **Install**. If Play Protect warns that it doesn't recognize the app, tap **More details → Install anyway**. It often warns about apps that don't come from the Play Store.
4. Open **Frontline 1944** from your home screen.

Works on Android 7.0 and newer, as long as Android System WebView is up to date (the Play Store updates it automatically).

**Updating:** install a newer APK right over the old one. Your progress stays, because every build is signed with the same key (`signing.keystore`). Uninstalling the app deletes your progress.

## What's in it

It's the same game as the web version in [`../frontline`](../frontline), packaged into a small native app:

- The game files are inside the APK. The app serves them to its WebView from a private `https://appassets.androidplatform.net/` address, so it plays offline. Only the fonts come from Google Fonts, and it falls back to the phone's own font without a connection.
- It runs full screen: the status and navigation bars hide, and a swipe in from the edge brings them back for a moment.
- It always plays sideways (landscape), either way round.
- The screen stays on while you play.
- Getting hit makes the phone buzz (turn it off under Settings → Vibration).
- **Back** closes a sheet, leaves the briefing, or pauses and resumes a battle. On the main menu it leaves the app.
- Switching to another app pauses the battle, unless AFK mode is on.
- Your progress is saved in the app's own storage.

| File | What it does |
| --- | --- |
| `src/app/frontline/game/MainActivity.java` | The native side: WebView setup, serving the game files, full screen, keep-screen-on, vibration, back button, pause/resume |
| `AndroidManifest.xml` | App name, icon, permissions (internet for the fonts, vibration), landscape screen |
| `res/` | Launcher icons (including the Android 8+ adaptive icon and the Android 13+ themed icon) and the dark theme |
| `build.sh` | Builds `dist/frontline.apk` |
| `signing.keystore` | The key the APK is signed with |
| `../frontline/js/main.js` | The game's side: `FL.app.back()` and `FL.app.hostPause()`, and it skips the service worker when `window.AndroidHost` is there |

## Building it

The build uses the Android command-line tools directly (no Gradle or Android Studio). On Ubuntu or Debian:

```sh
sudo apt install openjdk-21-jdk-headless aapt dalvik-exchange zipalign apksigner android-sdk-platform-23 zip
./build.sh
```

`build.sh` copies the game in from `../frontline` each time, so after changing the game just run it again. Bump `versionCode` and `versionName` in `AndroidManifest.xml` for each release you hand out.

The code compiles against the Android 6.0 SDK (the newest one Ubuntu packages) and targets Android 14.

### About the signing key

`signing.keystore` (password `frontline`) is committed on purpose. It lets anyone who builds this project produce an update that installs over your existing app. That's fine for a personal app you install yourself. Before publishing to the Google Play Store, create a new private key and keep it out of the repository.
