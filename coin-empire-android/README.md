# Coin Empire for Android

The Coin Empire idle tycoon as an installable Android app.

**Download:** [`dist/coin-empire.apk`](dist/coin-empire.apk) (about 260 KB, version 1.1)

## Installing it

1. Open the APK on your phone (from your browser's downloads or the Files app).
2. If Android says it can't install apps from that source, tap **Settings**, turn on **Allow from this source**, and go back.
3. Tap **Install**. If Play Protect warns it doesn't recognise the app, tap **More details → Install anyway**.
4. Open **Coin Empire** from your home screen.

Works on Android 7.0 and newer with an up-to-date Android System WebView. It runs fully offline and needs no permissions beyond vibration.

**Updating:** install a newer APK over the old one; your progress stays because every build is signed with the same key (`signing.keystore`). Uninstalling deletes your progress.

## What's in it

| File | What it does |
| --- | --- |
| `src/app/coinempire/game/MainActivity.java` | Full-screen WebView, serves the game files from inside the APK, saving, vibration, back button, pause/resume |
| `AndroidManifest.xml` | App name, icon, vibration permission, portrait screen |
| `res/` | Launcher icons (adaptive and themed) and the dark theme |
| `build.sh` | Builds `dist/coin-empire.apk` |
| `signing.keystore` | The key the APK is signed with (password `coinempire`) |

## Building it

Uses the Android command-line tools directly (no Gradle). On Ubuntu or Debian:

```sh
sudo apt install openjdk-21-jdk-headless aapt dalvik-exchange zipalign apksigner android-sdk-platform-23 zip
./build.sh
```

`build.sh` copies the game in from `../coin-empire` each time, so after changing the game just run it again.

The signing key is committed on purpose so anyone can build an update that installs over a sideloaded copy. Before publishing on Google Play, make a fresh private upload key and keep it out of the repository.
