# Emberdeep for Android

The Emberdeep idle dungeon crawler as a regular Android app: download the APK, install it, and it gets its own icon on your home screen. No app store needed.

**Download:** [`dist/emberdeep.apk`](dist/emberdeep.apk) (about 610 KB, version 1.0)

## Installing it

1. Open the APK on your phone (from your browser's downloads, the Files app, or wherever you downloaded it).
2. Android will say it can't install apps from that source. Tap **Settings**, turn on **Allow from this source**, and go back.
3. Tap **Install**. If Play Protect warns that it doesn't recognize the app, tap **More details → Install anyway**. It often warns about apps that don't come from the Play Store.
4. Open **Emberdeep** from your home screen.

Works on Android 7.0 and newer, as long as Android System WebView is up to date (the Play Store updates it automatically).

**Updating:** install a newer APK right over the old one. Your delve stays, because every build is signed with the same key (`signing.keystore`). Uninstalling the app deletes your save, so use **Settings → Copy save** first if you want to keep it.

## What's in it

It's the same game as the web version in [`../emberdeep`](../emberdeep), packaged into a small native app:

- The game files are inside the APK. The app serves them to its WebView from a private `https://appassets.androidplatform.net/` address, so the whole game works offline. Only the fonts come from Google Fonts, and it falls back to the phone's own font without a connection.
- **Camp reminder.** Turn it on in Settings (or tap **Remind me next time** on your first welcome-back card). When you leave, the app sets a real Android alarm for the moment your party will have delved as long as it can without you (12 hours to start, longer with the Hearth's Time talents). Then a notification says *"Your party has made camp"*, even if you closed the app. Opening the game cancels it. Android 13 and up asks permission the first time.
- Your save lives in the app's own storage.
- Vibration uses the phone's tuned click and tick effects on Android 10+.
- The back button closes the settings or whatever card is open (time away, a relic, rekindling) before it leaves the app.
- It saves the moment you switch away and catches up on everything your party did when you come back.

| File | What it does |
| --- | --- |
| `src/app/emberdeep/game/MainActivity.java` | The whole native side: WebView setup, serving the game files, saving, vibration, back button, pause/resume, scheduling the camp reminder |
| `src/app/emberdeep/game/NotifyReceiver.java` | Posts the reminder notification when its alarm fires, even if the app has since been closed |
| `AndroidManifest.xml` | App name, icon, permissions (internet for fonts, vibration, posting notifications), portrait screen |
| `res/` | Launcher icons (including the Android 8+ adaptive icon and the Android 13+ themed icon) and the dark theme |
| `build.sh` | Builds `dist/emberdeep.apk` |
| `signing.keystore` | The key the APK is signed with |
| `../emberdeep/js/host.js` | The game's side of the bridge (it looks for `window.AndroidHost`) |

## Building it

The build uses the Android command-line tools directly (no Gradle or Android Studio). On Ubuntu or Debian:

```sh
sudo apt install openjdk-21-jdk-headless aapt dalvik-exchange zipalign apksigner android-sdk-platform-23 zip
./build.sh
```

`build.sh` copies the game in from `../emberdeep` each time, so after changing the game just run it again. Bump `versionCode` and `versionName` in `AndroidManifest.xml` for each release you hand out.

The code compiles against the Android 6.0 SDK (the newest one Ubuntu packages) and targets Android 14. Features from newer Android versions, like notification channels and the tuned vibration effects, are reached by reflection and used only on phones that have them.

### About the signing key

`signing.keystore` (password `emberdeep`) is committed on purpose, so anyone who builds this project can produce an update that installs over an existing sideloaded copy. That's fine for a personal app installed by hand. If you ever publish it on Google Play, generate a fresh private key for that and keep it out of the repository.
