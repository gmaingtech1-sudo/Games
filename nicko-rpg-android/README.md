# Nicko RPG for Android

The Nicko RPG web game as a regular Android app: download the APK, install it, and it gets its own icon on your home screen. It works offline.

**Download:** [`dist/nicko-rpg.apk`](dist/nicko-rpg.apk) (about 440 KB, version 1.0.0)

## Installing it

1. Open the APK on your phone (from your browser's downloads, the Files app, or wherever you downloaded it).
2. Android will say it can't install apps from that source. Tap **Settings**, turn on **Allow from this source**, and go back.
3. Tap **Install**. If Play Protect warns that it doesn't recognise the app, tap **More details → Install anyway**. It often warns about apps that don't come from the Play Store.
4. Open **Nicko RPG** from your home screen.

It works on Android 7.0 and newer, as long as Android System WebView is up to date (the Play Store updates it automatically).

**Updating:** install a newer APK over the old one. Your saves stay, because every build is signed with the same key (`signing.keystore`). Uninstalling the app deletes your saves.

## What's in it

It's the same game as the web version in [`../nicko-rpg`](../nicko-rpg), packaged into a small native app:

- The game files are inside the APK. The app serves them to its WebView from a private `https://appassets.androidplatform.net/` address, so ES modules and local storage work exactly as in a browser, without the internet. The app asks for no permissions.
- Saves are kept in the WebView's local storage inside the app's private data.
- The **back button** closes dialogs and steps back through screens (bag → town, settings → game). In combat it does nothing, so you can't leave mid-fight by accident. On the main menu or the town it sends the app to the background instead of closing it.
- When you switch away, the game autosaves and stops the music, and the music resumes when you come back.
- It runs in portrait or landscape, and the layout adapts to phones and tablets.

| File | What it does |
| --- | --- |
| `src/app/nickorpg/game/MainActivity.java` | The whole native side: WebView setup, serving the game files, back button, pause and resume |
| `AndroidManifest.xml` | App name, icon, Android version range (no permissions) |
| `res/` | Launcher icons (including the Android 8+ adaptive icon and the Android 13+ themed icon) and the dark theme |
| `build.sh` | Builds `dist/nicko-rpg.apk` |
| `signing.keystore` | The key the APK is signed with (password `nickorpg`) |
| `../nicko-rpg/js/main.js` | The game's side of the bridge: `nickoBack()`, `nickoPause()`, `nickoResume()` |

## Building it

The build uses the Android command-line tools directly (no Gradle or Android Studio). On Ubuntu or Debian:

```sh
sudo apt install openjdk-21-jdk-headless aapt dalvik-exchange zipalign apksigner android-sdk-platform-23 zip
./build.sh
```

`build.sh` copies the game in from `../nicko-rpg` each time, so after changing the game, just run it again. It compiles against the Android 6.0 SDK (the newest one Ubuntu packages) and targets Android 14.

### About the signing key

`signing.keystore` is committed on purpose, so anyone who builds this project can produce an update that installs over an existing sideloaded copy. That's fine for a personal app you install by hand. Before publishing on Google Play, generate a fresh private key and keep it out of the repository. The [Pocket Mochi Android README](../pocket-mochi-android/README.md) explains how to build an App Bundle for Play Console.
