# Neon Break for Android

The Neon Break pool game as a regular Android app: download the APK, install it, and it gets its own icon on your home screen. No app store needed, and it plays offline.

**Download:** [`dist/neon-break.apk`](dist/neon-break.apk) (about 590 KB)

## Installing it

1. Open the APK on your phone (from your browser's downloads, the Files app, or wherever you downloaded it).
2. Android will say it can't install apps from that source. Tap **Settings**, turn on **Allow from this source**, and go back.
3. Tap **Install**. If Play Protect warns that it doesn't recognize the app, tap **More details → Install anyway**. It often warns about apps that don't come from the Play Store.
4. Open **Neon Break** from your home screen.

Works on Android 7.0 and newer, as long as Android System WebView is up to date (the Play Store updates it automatically).

**Updating:** install a newer APK right over the old one and your coins and unlocks stay, as long as the new APK is signed with the same key. Uninstalling the app deletes them.

## What's in it

It's the same game as the web version in [`../neon-break`](../neon-break), packaged into a small native app:

- The game files are inside the APK and served to a WebView from a private `https://appassets.androidplatform.net/` address. It needs no internet permission at all.
- Full screen, portrait, and the screen stays on while you play.
- Your coins, unlocks and stats are saved in the app's own storage.
- Ball hits, pots and fouls vibrate the phone (softer taps on Android 8+). You can turn this off in the menu.
- The back button pauses a match (or closes a menu) before it leaves the app. Switching away pauses the game.

| File | What it does |
| --- | --- |
| `src/app/neonbreak/game/MainActivity.java` | The native side: WebView setup, serving the game files, saving, vibration, back button, pause/resume, full screen |
| `AndroidManifest.xml` | App name, icon, vibration permission, portrait screen |
| `res/` | Launcher icons (including the Android 8+ adaptive icon and the Android 13+ themed icon) and the dark theme |
| `build.sh` | Builds `dist/neon-break.apk` |

## Building it

The build uses the Android command-line tools directly (no Gradle or Android Studio). On Ubuntu or Debian:

```sh
sudo apt install openjdk-21-jdk-headless aapt dalvik-exchange zipalign apksigner android-sdk-platform-23 zip
./build.sh
```

`build.sh` copies the game in from `../neon-break` each time, so after changing the game just run it again.

### About the signing key

The signing key (`signing.keystore`, password `neonbreak`) is not in the repository. `build.sh` creates one the first time it runs. Keep that file: Android only installs an update over the existing app if it's signed with the same key. An APK signed with a different key has to be installed fresh, after uninstalling the old one, which deletes your coins and unlocks.
