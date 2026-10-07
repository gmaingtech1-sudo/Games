# Wayfarers for Android

The Wayfarers AFK adventure as a regular Android app: download the APK, install it, and it gets its own icon on your home screen. No app store needed.

**Download:** [`dist/wayfarers.apk`](dist/wayfarers.apk) (about 368 KB, version 1.0.0)

## Installing it

1. Open the APK on your phone (from your browser's downloads, the Files app, or wherever you downloaded it).
2. Android will say it can't install apps from that source. Tap **Settings**, turn on **Allow from this source**, and go back.
3. Tap **Install**. If Play Protect warns that it doesn't recognize the app, tap **More details → Install anyway**. It often warns about apps that don't come from the Play Store.
4. Open **Wayfarers** from your home screen.

Works on Android 7.0 and newer, as long as Android System WebView is up to date (the Play Store updates it automatically).

**Updating:** install a newer APK right over the old one. Your heroes stay, because every build is signed with the same key (`signing.keystore`). Uninstalling the app deletes your progress. The app and the web version keep separate saves.

## What's in it

It's the same game as the web version in [`../wayfarers`](../wayfarers), packaged into a small native app:

- The game files are inside the APK. The app serves them to its WebView from a private `https://appassets.androidplatform.net/` address, so the game works offline. Only the fonts come from Google Fonts, and it falls back to the phone's font without a connection.
- **Chest reminder** (in Settings, off until you turn it on): when you leave the app, it sets a real Android alarm for the moment your AFK chest fills up, so "Your AFK chest is full!" arrives even after the app is closed. Android 13 and up asks permission the first time.
- Your progress is saved in the app's own storage, and saved again whenever you switch away.
- The screen stays on while the app is open, so you can leave it running and watch the party fight.
- Vibration on level-ups, upgrades, summons, boss kills and claiming the chest, using the phone's tuned click and tick effects on Android 10+. It can be turned off in Settings.
- The back button closes an open sheet (a hero, summon results, settings) before it leaves the app.
- Loot for the time you were away is added when you come back, the same as in the browser.

| File | What it does |
| --- | --- |
| `src/app/wayfarers/game/MainActivity.java` | The whole native side: WebView setup, serving the game files, saving, vibration, back button, pause/resume, keeping the screen on, scheduling the reminder |
| `src/app/wayfarers/game/NotifyReceiver.java` | Posts the reminder notification when its alarm fires, even if the app has since been closed |
| `AndroidManifest.xml` | App name, icon, permissions (internet for fonts, vibration, posting notifications), portrait screen |
| `res/` | Launcher icons (including the Android 8+ adaptive icon and the Android 13+ themed icon) and the dark theme |
| `build.sh` | Builds `dist/wayfarers.apk`, for sideloading |
| `build-aab.sh` | Builds `dist/wayfarers.aab`, the format Google Play requires for a new app's Play Console upload |
| `signing.keystore` | The key both the APK and the App Bundle are signed with |
| `../wayfarers/js/host.js` | The game's side of the bridge (it looks for `window.AndroidHost`) |

## Building it

The build uses the Android command-line tools directly (no Gradle or Android Studio). On Ubuntu or Debian:

```sh
sudo apt install openjdk-21-jdk-headless aapt dalvik-exchange zipalign apksigner android-sdk-platform-23 zip
./build.sh
```

`build.sh` copies the game in from `../wayfarers` each time, so after changing the game just run it again.

The code compiles against the Android 6.0 SDK (the newest one Ubuntu packages) and targets Android 14. Features from newer Android versions, like notification channels and the tuned vibration effects, are used only on phones that have them.

### Building the App Bundle (for Google Play)

Play Console only accepts an `.aab` (App Bundle) for a new app's release, not the `.apk` above. `build-aab.sh` makes one by reusing `build.sh`'s compiled resources and dex (run `build.sh` first), relinking the resources in the protobuf format a bundle module needs, and packaging it with [bundletool](https://github.com/google/bundletool):

```sh
./build.sh
BUNDLETOOL=/path/to/bundletool-all-*.jar ./build-aab.sh
```

Upload the resulting `dist/wayfarers.aab` in the Play Console release flow ("Upload app bundles"). It's signed with the same `signing.keystore` as the APK, which Play Console will use as your **upload key**. Enroll in Play App Signing (Play Console offers it automatically for a new app) and Google re-signs the app itself with a separate key it manages.

### About the signing key

`signing.keystore` (password `wayfarers`) is committed on purpose, so anyone who builds this project can produce an update that installs over an existing sideloaded app. That's fine for a personal app installed by hand. If you use it as a Play Console upload key for a real listing, anyone with repository access could push an update to it, so before a production release generate a fresh private key, use that as the upload key instead, and keep it out of the repository.
