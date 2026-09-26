# Pet Cam for Android

The Pet Cam AR pet as a regular Android app: download the APK, install it, and it gets its own icon on your home screen. No app store, and no HTTPS hosting needed for the camera.

**Download:** [`dist/pet-cam.apk`](dist/pet-cam.apk) (about 180 KB)

## Installing it

1. Open the APK on your phone (from your browser's downloads, the Files app, or wherever you downloaded it).
2. Android will say it can't install apps from that source. Tap **Settings**, turn on **Allow from this source**, and go back.
3. Tap **Install**. If Play Protect warns that it doesn't recognize the app, tap **More details → Install anyway**. It often warns about apps that don't come from the Play Store.
4. Open **Pet Cam** from your home screen and tap **Open camera**. Android asks once for camera access. If you say no, you play in a pretend room instead. You can turn it on later in **Settings → Apps → Pet Cam → Permissions**.

Works on Android 7.0 and newer, as long as Android System WebView is up to date (the Play Store updates it automatically). Most phones have the motion sensors the AR needs. On phones without them, you drag to look around.

**Updating:** install a newer APK right over the old one. Your pet stays, because every build is signed with the same key (`signing.keystore`). Uninstalling the app deletes your pet. Pet Cam and Pocket Mochi are separate apps, so you can have both.

## What's in it

It's the same game as the web version in [`../pet-cam`](../pet-cam), packaged into a small native app:

- The game files are inside the APK. The app serves them to its WebView from a private `https://appassets.androidplatform.net/` address, which counts as a secure page, so the camera works without the internet. Only the fonts come from Google Fonts, and it falls back to the phone's font without a connection.
- The camera picture stays on the phone. The camera turns off whenever you switch away from the app.
- **Save** puts the photo in your gallery under **Pictures/Pet Cam**. **Share** opens Android's share sheet.
- Your pet is saved in the app's own storage.
- The screen stays on while you play.
- Vibration uses the phone's tuned click and tick effects on Android 10+.
- The back button closes a photo or the menu, or puts the ball down, before it leaves the app.

| File | What it does |
| --- | --- |
| `src/app/petcam/game/MainActivity.java` | The native side: WebView setup, serving the game files, camera permission, saving, photos, vibration, back button, pause/resume |
| `src/app/petcam/game/PhotoProvider.java` | Hands the photo you're sharing to the app you pick (read-only, one file at a time) |
| `AndroidManifest.xml` | App name, icon, permissions (camera, internet for fonts, vibration, storage for saving photos on Android 9 and older), portrait screen |
| `res/` | Launcher icons (including the Android 8+ adaptive icon and the Android 13+ themed icon) and the dark theme |
| `build.sh` | Builds `dist/pet-cam.apk` |
| `signing.keystore` | The key the APK is signed with |
| `../pet-cam/js/host.js` | The game's side of the bridge (it looks for `window.AndroidHost`) |

## Building it

The build uses the Android command-line tools directly (no Gradle or Android Studio). On Ubuntu or Debian:

```sh
sudo apt install openjdk-21-jdk-headless aapt dalvik-exchange zipalign apksigner android-sdk-platform-23 zip
./build.sh
```

`build.sh` copies the game in from `../pet-cam` each time, so after changing the game just run it again.

The code compiles against the Android 6.0 SDK (the newest one Ubuntu packages) and targets Android 14. Features from newer Android versions are used only on phones that have them. These include saving to the gallery without a storage permission and the tuned vibration effects.

### About the signing key

`signing.keystore` (password `petcamapp`) is committed on purpose. It lets anyone who builds this project produce an update that installs over your existing app. That's fine for a personal app you install yourself. Before publishing to the Google Play Store, create a new private key and keep it out of the repository.
