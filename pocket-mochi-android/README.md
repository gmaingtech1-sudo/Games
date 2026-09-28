# Pocket Mochi for Android

The Pocket Mochi virtual pet as a regular Android app: download the APK, install it, and it gets its own icon on your home screen. No Expo Go, no app store.

**Download:** [`dist/pocket-mochi.apk`](dist/pocket-mochi.apk) (about 250 KB, version 1.5.0)

## Installing it

1. Open the APK on your phone (from your browser's downloads, the Files app, or wherever you downloaded it).
2. Android will say it can't install apps from that source. Tap **Settings**, turn on **Allow from this source**, and go back.
3. Tap **Install**. If Play Protect warns that it doesn't recognize the app, tap **More details → Install anyway**. It often warns about apps that don't come from the Play Store.
4. Open **Pocket Mochi** from your home screen.

Works on Android 7.0 and newer, as long as Android System WebView is up to date (the Play Store updates it automatically).

**Updating:** install a newer APK right over the old one. Your pet stays, because every build is signed with the same key (`signing.keystore`). Uninstalling the app deletes your pet.

## What's in it

It's the same game as the web version in [`../pocket-mochi`](../pocket-mochi), packaged into a small native app:

- The game files are inside the APK. The app serves them to its WebView from a private `https://appassets.androidplatform.net/` address, so the game works offline. Only the fonts come from Google Fonts (it falls back to the phone's font without a connection), and online playdates with a friend need the internet.
- Turning on Notifications schedules a real Android alarm for whenever your pet is expected to next need something, so a reminder like "Mochi is hungry" still arrives after you've closed the app. Android 13 and up asks permission the first time.
- Your pet is saved in the app's own storage.
- Vibration uses the phone's tuned click and tick effects on Android 10+.
- The back button closes the shop, snack tray, washing, the mini-game or a duel invite before it leaves the app, and collects the daily reward when its card is open.
- It saves when you switch away and catches up on your pet's needs when you come back.

| File | What it does |
| --- | --- |
| `src/app/pocketmochi/game/MainActivity.java` | The whole native side: WebView setup, serving the game files, saving, vibration, back button, pause/resume, scheduling reminders |
| `src/app/pocketmochi/game/NotifyReceiver.java` | Posts the reminder notification when its alarm fires, even if the app has since been closed |
| `AndroidManifest.xml` | App name, icon, permissions (internet for fonts and playdates, vibration, posting notifications), portrait screen |
| `res/` | Launcher icons (including the Android 8+ adaptive icon and the Android 13+ themed icon) and the dark theme |
| `build.sh` | Builds `dist/pocket-mochi.apk` |
| `signing.keystore` | The key the APK is signed with |
| `../pocket-mochi/js/host.js` | The game's side of the bridge (it looks for `window.AndroidHost`) |

## Building it

The build uses the Android command-line tools directly (no Gradle or Android Studio). On Ubuntu or Debian:

```sh
sudo apt install openjdk-21-jdk-headless aapt dalvik-exchange zipalign apksigner android-sdk-platform-23 zip
./build.sh
```

`build.sh` copies the game in from `../pocket-mochi` each time, so after changing the game just run it again.

The code compiles against the Android 6.0 SDK (the newest one Ubuntu packages) and targets Android 14. Features from newer Android versions, like the tuned vibration effects, are used only on phones that have them.

### About the signing key

`signing.keystore` (password `pocketmochi`) is committed on purpose. It lets anyone who builds this project produce an update that installs over your existing app. That's fine for a personal app you install yourself. Before publishing to the Google Play Store, create a new private key and keep it out of the repository.
