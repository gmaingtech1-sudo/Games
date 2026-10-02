# ParanormalADHDhunters for Android

The ParanormalADHDhunters paranormal investigation game as a regular Android app: download the APK, install it, and it gets its own icon on your home screen. No app store needed.

**Download:** [`dist/paranormal-adhd-hunters.apk`](dist/paranormal-adhd-hunters.apk) (about 920 KB, version 1.0.0)

## Installing it

1. Open the APK on your phone (from your browser's downloads, the Files app, or wherever you downloaded it).
2. Android will say it can't install apps from that source. Tap **Settings**, turn on **Allow from this source**, and go back.
3. Tap **Install**. If Play Protect warns that it doesn't recognize the app, tap **More details → Install anyway**. It often warns about apps that don't come from the Play Store.
4. Open **ADHD Hunters** from your home screen. (The full name, ParanormalADHDhunters, is too long to fit under an icon; it's used everywhere else.)

Works on Android 7.0 and newer, as long as Android System WebView is up to date (the Play Store updates it automatically). It's a 3D game, so a phone from the last few years plays best; if it feels slow, set **Graphics** to **Low** in Settings and restart the app.

**Updating:** install a newer APK right over the old one. Your investigator, coins and story progress stay, because every build is signed with the same key (`signing.keystore`). Uninstalling the app deletes your progress.

## What's in it

It's the same game as the web version in [`../paranormal-adhd-hunters`](../paranormal-adhd-hunters), packaged into a small native app:

- The game files are inside the APK. The app serves them to its WebView from a private `https://appassets.androidplatform.net/` address, so WebGL, sound and team play work exactly as in a browser, and single-player works offline. Only the fonts come from Google Fonts (it falls back to the phone's fonts without a connection), and team play needs the internet.
- It runs full screen: the status and navigation bars hide, and a swipe from the edge brings them back for a moment. The screen stays on while you play.
- It turns with your phone (portrait or landscape) unless you've locked rotation.
- **Back** closes whatever menu is open, pauses an investigation, and only leaves the app from the main menu.
- Switching away pauses a solo investigation and silences the sound.
- Spirit box answers are spoken with the phone's own text-to-speech voice, pitched down (or up, for the Child Spirit).
- Vibration uses the phone's motor, for slams, surges and getting spooked.
- Your progress is kept in the WebView's storage and also copied into the app's own storage, so it survives the WebView's data being cleared.

It asks for only two permissions: internet (fonts and team play) and vibration. It never uses the camera, microphone or location.

| File | What it does |
| --- | --- |
| `src/app/paranormaladhdhunters/game/MainActivity.java` | The whole native side: WebView setup, serving the game files, full screen, back button, pause/resume, vibration, text-to-speech and the save copy |
| `AndroidManifest.xml` | App name, launcher label, permissions (internet, vibration), rotation and the OpenGL ES requirement |
| `res/` | Launcher icons (including the Android 8+ adaptive icon and the Android 13+ themed icon) and the dark theme |
| `build.sh` | Builds `dist/paranormal-adhd-hunters.apk` |
| `signing.keystore` | The key the APK is signed with |
| `../paranormal-adhd-hunters/js/host.js` | The game's side of the bridge (it looks for `window.AndroidHost`) |

## Building it

The build uses the Android command-line tools directly (no Gradle or Android Studio). On Ubuntu or Debian:

```sh
sudo apt install openjdk-21-jdk-headless aapt dalvik-exchange zipalign apksigner android-sdk-platform-23 zip
./build.sh
```

`build.sh` copies the game in from `../paranormal-adhd-hunters` each time, so after changing the game just run it again. Bump `versionCode` and `versionName` in `AndroidManifest.xml` for each release you hand out, so phones see it as an update.

The code compiles against the Android 6.0 SDK (the newest one Ubuntu packages) and targets Android 14.

### About the signing key

`signing.keystore` (password `pahunters`) is committed on purpose, so anyone who builds this project can produce an update that installs over an existing sideloaded app. That's fine for an app you install by hand. If you ever publish it on Google Play, generate a fresh private key for that, keep it out of the repository, and use it as your upload key instead.
