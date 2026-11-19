# Hyperdot for Android

The Hyperdot puzzle game as a regular Android app: download the APK, install it, and it gets its own icon on your home screen. No app store needed.

**Download:** [`dist/hyperdot.apk`](dist/hyperdot.apk) (about 190 KB, version 1.0.0)

## Installing it

1. Open the APK on your phone (from your browser's downloads, the Files app, or wherever you downloaded it).
2. Android will say it can't install apps from that source. Tap **Settings**, turn on **Allow from this source**, and go back.
3. Tap **Install**. If Play Protect warns that it doesn't recognize the app, tap **More details → Install anyway**. It often warns about apps that don't come from the Play Store.
4. Open **Hyperdot** from your home screen.

Works on Android 7.0 and newer, as long as Android System WebView is up to date (the Play Store updates it automatically).

**Updating:** install a newer APK right over the old one. Your progress stays, because every build is signed with the same key (`signing.keystore`). Uninstalling the app deletes your progress.

## What's in it

It's the same game as the web version in [`../hyperdot`](../hyperdot), packaged into a small native app:

- The game files are inside the APK. The app serves them to its WebView from a private `https://appassets.androidplatform.net/` address, so the game works offline. Only the font comes from Google Fonts (it falls back to the phone's font without a connection).
- Your progress is saved in the app's own storage.
- Vibration uses the phone's tuned click and tick effects on Android 10+ (Android's WebView ignores the browser's vibration call, so the game asks the app instead).
- The back button closes a sheet or card, or steps back a screen (puzzle → levels → worlds → title), before it leaves the app.
- It turns with the phone: in landscape the move pad sits beside the view. The screen stays on while the app is open, so it doesn't dim while you think.
- Sound pauses when you switch away.

| File | What it does |
| --- | --- |
| `src/app/hyperdot/game/MainActivity.java` | The whole native side: WebView setup, serving the game files, saving, vibration, back button, pause/resume |
| `AndroidManifest.xml` | App name, icon, permissions (internet for the font, vibration) |
| `res/` | Launcher icons (including the Android 8+ adaptive icon and the Android 13+ themed icon) and the dark theme |
| `build.sh` | Builds `dist/hyperdot.apk` |
| `signing.keystore` | The key the APK is signed with |
| `../hyperdot/js/core.js` | The game's side of the bridge (it looks for `window.AndroidHost`) |

## Building it

The build uses the Android command-line tools directly (no Gradle or Android Studio). On Ubuntu or Debian:

```sh
sudo apt install openjdk-21-jdk-headless aapt dalvik-exchange zipalign apksigner android-sdk-platform-23 zip
./build.sh
```

`build.sh` copies the game in from `../hyperdot` each time, so after changing the game just run it again. Bump `versionCode` and `versionName` in `AndroidManifest.xml` for a new release.

The code compiles against the Android 6.0 SDK (the newest one Ubuntu packages) and targets Android 14. Features from newer Android versions, like the tuned vibration effects, are used only on phones that have them.

### About the signing key

`signing.keystore` (password `hyperdot`) is committed on purpose, so anyone who builds this project can produce an update that installs over an existing sideloaded app. That's fine for a personal app installed by hand. If you ever publish it on Google Play, generate a fresh private key for that and keep it out of the repository.
