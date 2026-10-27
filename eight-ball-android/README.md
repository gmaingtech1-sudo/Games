# Eight-Ball for Android

The Eight-Ball pool game as a regular Android app: download the APK, install it, and it gets its own icon on your home screen. No app store needed.

**Download:** [`dist/eight-ball.apk`](dist/eight-ball.apk) (about 556 KB, version 1.5)

## Installing it

1. Open the APK on your phone (from your browser's downloads, the Files app, or wherever you downloaded it).
2. Android will say it can't install apps from that source. Tap **Settings**, turn on **Allow from this source**, and go back.
3. Tap **Install**. If Play Protect warns that it doesn't recognize the app, tap **More details → Install anyway**. It often warns about apps that don't come from the Play Store.
4. Open **Eight-Ball** from your home screen.

Works on Android 7.0 and newer, as long as Android System WebView is up to date (the Play Store updates it automatically).

**Updating:** install a newer APK right over the old one. Your settings and record against the computer stay, because every build is signed with the same key (`signing.keystore`). Uninstalling the app deletes them.

## What's in it

It's the same game as the web version in [`../eight-ball`](../eight-ball), packaged into a small native app:

- The game files are inside the APK and served to its WebView from a private `https://appassets.androidplatform.net/` address, so it plays offline. Only the fonts come from Google Fonts, and it falls back to the phone's font without a connection.
- It runs full screen, with the status and navigation bars hidden (swipe from the edge to bring them back).
- The table is in 3D, drawn with the phone's graphics chip (WebGL). Use the camera button to switch between the player's view, overhead and top-down.
- The view turns with the phone: upright or sideways. Rotating doesn't restart the game.
- The screen stays on while you play.
- The phone gives a little buzz when a ball drops, a firmer one for a foul, and a double one when a frame is won. On Android 10+ these use the phone's tuned click effects.
- The back button closes the spin, settings or pause sheet, leaves the rules, and pauses a match before it leaves the app.
- Switching away from the app pauses the match, so the shot clock and the computer wait for you.

| File | What it does |
| --- | --- |
| `src/app/eightball/game/MainActivity.java` | The whole native side: WebView setup, serving the game files, full screen, vibration, back button, pausing |
| `AndroidManifest.xml` | App name, icon, permissions (internet for fonts, vibration), screen rotation |
| `res/` | Launcher icons (including the Android 8+ adaptive icon and the Android 13+ themed icon) and the dark theme |
| `build.sh` | Builds `dist/eight-ball.apk`, for installing yourself |
| `build-aab.sh` | Builds `dist/eight-ball.aab`, the format Google Play needs for a new app |
| `signing.keystore` | The key the app is signed with |
| `../eight-ball/js/main.js` | The game's side of the bridge: `EB.app.back()` and `EB.app.pause()`, which the app calls |

## Building it

The build uses the Android command-line tools directly (no Gradle or Android Studio). On Ubuntu or Debian:

```sh
sudo apt install openjdk-21-jdk-headless aapt dalvik-exchange zipalign apksigner android-sdk-platform-23 zip
./build.sh
```

`build.sh` copies the game in from `../eight-ball` each time, so after changing the game just run it again. Bump `versionCode` and `versionName` in `AndroidManifest.xml` for each release.

The code compiles against the Android 6.0 SDK (the newest one Ubuntu packages) and targets Android 14. Features from newer Android versions, like the tuned vibration effects, are used only on phones that have them.

### For Google Play

Play Console only accepts an `.aab` (App Bundle) for a new app. Run `build.sh` first, then `build-aab.sh` with [bundletool](https://github.com/google/bundletool):

```sh
./build.sh
BUNDLETOOL=/path/to/bundletool-all-*.jar ./build-aab.sh
```

This works the same way as Pocket Mochi's bundle build. No `.aab` is committed yet.

### About the signing key

`signing.keystore` (password `eightball`) is committed on purpose. It lets anyone who builds this project produce an update that installs over an existing copy. That's fine for a personal app you install yourself. Before publishing on the Google Play Store, create a new private key and keep it out of the repository.
