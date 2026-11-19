# Nested Arcade for Android

[Nested Arcade](../nested-arcade) as an installable Android app.

**Download:** [`dist/nested-arcade.apk`](dist/nested-arcade.apk) (about 164 KB, version 1.0)

## Installing it

1. Open the APK on your phone (from your browser's downloads or the Files app).
2. If Android says it can't install apps from that source, tap **Settings**, turn on **Allow from this source**, and go back.
3. Tap **Install**. If Play Protect says it doesn't recognise the app, tap **More details → Install anyway**.
4. Open **Nested Arcade** from your home screen.

Works on Android 7.0 and newer with an up-to-date Android System WebView. It needs no internet: everything is inside the APK.

- The **back button** steps you out of the game you're in (Pip Dash → Star Hopper → the Arcade), closes the prize counter, or pauses.
- The arcade clock stops when you switch away from the app.
- High scores are kept in the app's own storage.

| File | What it does |
| --- | --- |
| `src/app/nestedarcade/game/MainActivity.java` | The WebView, serving the game files offline, vibration and the back button |
| `AndroidManifest.xml` | App name, icon, vibration permission, portrait screen |
| `res/` | Launcher icons (including adaptive and Android 13 themed icons) and the theme |
| `build.sh` | Builds `dist/nested-arcade.apk` |
| `signing.keystore` | The key the APK is signed with, so new versions install over old ones |

## Building it

Uses the Android command-line tools directly (no Gradle). On Ubuntu or Debian:

```sh
sudo apt install openjdk-21-jdk-headless aapt dalvik-exchange zipalign apksigner android-sdk-platform-23 zip
./build.sh
```

`build.sh` copies the game in from `../nested-arcade` each time.
