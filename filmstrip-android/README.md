# Filmstrip for Android

The Filmstrip video maker as a regular Android app: download the APK, install it, and it gets its own icon on your home screen. No app store, and no HTTPS hosting needed for the camera.

**Download:** [`dist/filmstrip.apk`](dist/filmstrip.apk) (about 200 KB)

## Installing it

1. Open the APK on your phone (from your browser's downloads, the Files app, or wherever you downloaded it).
2. Android will say it can't install apps from that source. Tap **Settings**, turn on **Allow from this source**, and go back.
3. Tap **Install**. If Play Protect warns that it doesn't recognize the app, tap **More details → Install anyway**. It often warns about apps that don't come from the Play Store.
4. Open **Filmstrip** from your home screen. The first time you tap **Record**, Android asks for the camera and microphone. If you say no to the microphone, it records without sound. You can change this later in **Settings → Apps → Filmstrip → Permissions**.

Works on Android 7.0 and newer, as long as Android System WebView is up to date (the Play Store updates it automatically).

**Updating:** install a newer APK right over the old one. Your project stays, because every build is signed with the same key (`signing.keystore`). Uninstalling the app deletes your project, but not videos you saved to the gallery.

## What's in it

It's the same app as the web version in [`../filmstrip`](../filmstrip), packaged into a small native app:

- The app's files are inside the APK. The app serves them to its WebView from a private `https://appassets.androidplatform.net/` address, which counts as a secure page, so the camera works without the internet. Only the font comes from Google Fonts, and it falls back to the phone's font without a connection.
- The AI helper (the **AI** button and **✦ Suggest**) needs an internet connection and your own Claude API key, which you paste into **Settings**. See [the AI helper](../filmstrip/README.md#the-ai-helper).
- **Media** and **Music** open Android's picker, so you can choose from your gallery, Google Photos, Files and so on. You can pick several photos and clips at once.
- **Save to gallery** puts the finished video in **Movies/Filmstrip**. **Share** opens Android's share sheet.
- The screen stays on while you record or save a video.
- If you leave the app while a video is saving, saving pauses and carries on when you come back.
- The back button closes a sheet or the camera before it leaves the app.
- Your project is kept in the app's own storage.

| File | What it does |
| --- | --- |
| `src/app/filmstrip/video/MainActivity.java` | The native side: WebView setup, serving the app's files, file pickers, camera and microphone permissions, keeping the screen on, receiving finished videos and saving or sharing them, back button |
| `src/app/filmstrip/video/VideoProvider.java` | Hands the video you're sharing to the app you pick (read-only, one file at a time) |
| `AndroidManifest.xml` | App name, icon, permissions (camera, microphone, internet for the AI helper and the font, storage for saving videos on Android 9 and older), portrait screen |
| `res/` | Launcher icons (including the Android 8+ adaptive icon and the Android 13+ themed icon) and the dark theme |
| `build.sh` | Builds `dist/filmstrip.apk` |
| `signing.keystore` | The key the APK is signed with |
| `../filmstrip/js/host.js` | The app's side of the bridge (it looks for `window.AndroidHost`) |

A finished video can be over a gigabyte, and the bridge between the page and the app only carries text. So when you tap **Save to gallery** or **Share**, the page sends the video over in 3 MB pieces ("Getting it ready…"), and the app writes them into a file in its cache. The latest video is kept there until you make another one or reopen the app, so tapping Share after Save doesn't copy it again.

## Building it

The build uses the Android command-line tools directly (no Gradle or Android Studio). On Ubuntu or Debian:

```sh
sudo apt install openjdk-21-jdk-headless aapt dalvik-exchange zipalign apksigner android-sdk-platform-23 zip
./build.sh
```

`build.sh` copies the app in from `../filmstrip` each time, so after changing the app just run it again.

The code compiles against the Android 6.0 SDK (the newest one Ubuntu packages) and targets Android 14. Saving to the gallery without a storage permission is used only on Android 10 and newer, which have it.

### About the signing key

`signing.keystore` (password `filmstripapp`) is committed on purpose. It lets anyone who builds this project produce an update that installs over your existing app. That's fine for a personal app you install yourself. Before publishing to the Google Play Store, create a new private key and keep it out of the repository.
