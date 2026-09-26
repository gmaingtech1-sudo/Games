# Cosmos 360 for Android

The Cosmos 360 space game as a regular Android app: download the APK, install it, and it gets its own icon on your home screen. No app store needed.

**Download:** [`dist/cosmos-360.apk`](dist/cosmos-360.apk) (about 760 KB)

## Installing it

1. Open the APK on your phone (from your browser's downloads, the Files app, or wherever you saved it).
2. Android will say it can't install apps from that source. Tap **Settings**, turn on **Allow from this source**, and go back.
3. Tap **Install**. If Play Protect warns that it doesn't recognise the app, tap **More details → Install anyway**. It often warns about apps that don't come from the Play Store.
4. Open **Cosmos 360** from your home screen and tap **Launch**.

Works on Android 7.0 and newer with a phone that supports OpenGL ES 3 (nearly every phone from the last several years), as long as Android System WebView is up to date (the Play Store updates it automatically). The **360°** button uses the phone's motion sensors; on phones without them, drag to look around.

The first time you arrive in a star system the game paints its planets, which takes a few seconds. If it runs slowly, pick **Low** graphics in **Settings**.

**Updating:** install a newer APK right over the old one. Your logbook stays, because every build is signed with the same key (`signing.keystore`). Uninstalling the app deletes your logbook.

## What's in it

It's the same game as the web version in [`../cosmos-360`](../cosmos-360), packaged into a small native app:

- The game files are inside the APK. The app serves them to its WebView from a private `https://appassets.androidplatform.net/` address, which counts as a secure page, so the motion sensors work without the internet. Only the fonts come from Google Fonts, and it falls back to the phone's font without a connection.
- It runs full screen, edge to edge, in portrait or landscape.
- **Save to gallery** puts photos in **Pictures/Cosmos 360**. **Share** opens Android's share sheet.
- Your logbook and settings are saved in the app's own storage.
- The screen stays on while you play, and the sound pauses when you switch away.
- The back button closes the logbook, star map or any other panel before it leaves the app.

| File | What it does |
| --- | --- |
| `src/app/cosmos360/game/MainActivity.java` | The native side: WebView setup, serving the game files, full screen, saving and sharing photos, back button, pause/resume |
| `src/app/cosmos360/game/PhotoProvider.java` | Hands the photo you're sharing to the app you pick (read-only, one file at a time) |
| `AndroidManifest.xml` | App name, icon, permissions (internet for fonts, storage for saving photos on Android 9 and older), OpenGL ES 3 requirement |
| `res/` | Launcher icons (including the Android 8+ adaptive icon and the Android 13+ themed icon) and the dark theme |
| `build.sh` | Builds `dist/cosmos-360.apk` |
| `signing.keystore` | The key the APK is signed with |

The game's side of the bridge is small: it looks for `window.AndroidHost` (in `../cosmos-360/js/main.js` and `ui.js`) and listens on `window.cosmosApp.receive()`.

## Building it

The build uses the Android command-line tools directly (no Gradle or Android Studio). On Ubuntu or Debian:

```sh
sudo apt install openjdk-21-jdk-headless aapt dalvik-exchange zipalign apksigner android-sdk-platform-23 zip
./build.sh
```

`build.sh` copies the game in from `../cosmos-360` each time, so after changing the game just run it again.

The code compiles against the Android 6.0 SDK (the newest one Ubuntu packages) and targets Android 14. Features from newer Android versions are used only on phones that have them, such as saving to the gallery without a storage permission and drawing around the camera cutout.

### About the signing key

`signing.keystore` (password `cosmos360app`) is committed on purpose. It lets anyone who builds this project produce an update that installs over your existing app. That's fine for a personal app you install yourself. Before publishing to the Google Play Store, create a new private key and keep it out of the repository.
