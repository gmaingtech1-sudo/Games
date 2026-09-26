# Starforge for Android

The Starforge space shooter as a regular Android app: download the APK, install it, and it gets its own icon on your home screen. No app store needed.

**Download:** [`dist/starforge.apk`](dist/starforge.apk) (about 440 KB)

## Installing it

1. Open the APK on your phone (from your browser's downloads, the Files app, or wherever you downloaded it).
2. Android will say it can't install apps from that source. Tap **Settings**, turn on **Allow from this source**, and go back.
3. Tap **Install**. If Play Protect warns that it doesn't recognize the app, tap **More details → Install anyway**. It often warns about apps that don't come from the Play Store.
4. Open **Starforge** from your home screen.

Works on Android 7.0 and newer, as long as Android System WebView is up to date (the Play Store updates it automatically).

**Updating:** install a newer APK right over the old one. Your credits, parts and ship stay, because every build is signed with the same key (`signing.keystore`). Uninstalling the app deletes your progress. The app and the web version keep separate saves.

## What's in it

It's the same game as the web version in [`../starforge`](../starforge), packaged into a small native app:

- The game files are inside the APK. The app serves them to its WebView from a private `https://appassets.androidplatform.net/` address, so the game works offline. Only the fonts come from Google Fonts, and it falls back to the phone's font without a connection.
- While you fly, the game goes full screen and hides the status and navigation bars. Swipe in from the edge to bring them back for a moment. The hangar keeps the bars, so the keyboard works when you rename your ship.
- The screen stays on while the app is open.
- Your progress is saved in the app's own storage.
- Vibration uses the phone's tuned click and tick effects on Android 10+, and a longer rumble for explosions and specials.
- The back button closes the settings or rename sheet. While flying, it pauses the game and a second press resumes. On the end-of-run summary, it takes you back to the hangar. In the hangar, it leaves the app.
- Switching to another app pauses the flight, silences the sound and stops the game from running in the background.

| File | What it does |
| --- | --- |
| `src/app/starforge/game/MainActivity.java` | The whole native side: WebView setup, serving the game files, saving, vibration, full screen, back button, pause/resume |
| `AndroidManifest.xml` | App name, icon, permissions (internet for fonts, vibration), portrait screen |
| `res/` | Launcher icons (including the Android 8+ adaptive icon and the Android 13+ themed icon) and the dark theme |
| `build.sh` | Builds `dist/starforge.apk` |
| `signing.keystore` | The key the APK is signed with |
| `../starforge/js/host.js` | The game's side of the bridge (it looks for `window.AndroidHost`) |

## Building it

The build uses the Android command-line tools directly (no Gradle or Android Studio). On Ubuntu or Debian:

```sh
sudo apt install openjdk-21-jdk-headless aapt dalvik-exchange zipalign apksigner android-sdk-platform-23 zip
./build.sh
```

`build.sh` copies the game in from `../starforge` each time, so after changing the game just run it again. Bump `versionCode` in `AndroidManifest.xml` when you publish a new build.

The code compiles against the Android 6.0 SDK (the newest one Ubuntu packages) and targets Android 14. Features from newer Android versions, like the tuned vibration effects, are used only on phones that have them.

### About the signing key

`signing.keystore` (password `starforgeapp`) is committed on purpose. It lets anyone who builds this project produce an update that installs over your existing app. That's fine for a personal app you install yourself. Before publishing to the Google Play Store, create a new private key and keep it out of the repository.
