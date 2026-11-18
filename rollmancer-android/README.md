# Rollmancer for Android

The Rollmancer dice roguelite as a regular Android app: install it and it gets its own icon on your home screen. It's also the build that goes on Google Play (see [`../rollmancer/SELLING.md`](../rollmancer/SELLING.md)).

**Download:** [`dist/rollmancer.apk`](dist/rollmancer.apk) (about 670 KB, version 1.2.0) · Play Store upload: [`dist/rollmancer.aab`](dist/rollmancer.aab)

## Installing the APK

1. Open the APK on your phone (from your browser's downloads, the Files app, or wherever you put it).
2. Android will say it can't install apps from that source. Tap **Settings**, turn on **Allow from this source**, and go back.
3. Tap **Install**. If Play Protect warns that it doesn't recognise the app, tap **More details → Install anyway**.
4. Open **Rollmancer** from your home screen.

Works on Android 7.0 and newer, as long as Android System WebView is up to date (the Play Store updates it automatically).

**Updating:** install a newer APK right over the old one; your save stays, because every build is signed with the same key. Uninstalling deletes your save. (A copy installed from Google Play is signed by Google instead, so it can't be updated with a sideloaded APK or the other way round.)

## What's in it

It's the same game as the web version in [`../rollmancer`](../rollmancer), packaged into a small native shell:

- The game files are inside the app and served to its WebView from a private `https://appassets.androidplatform.net/` address. The fonts are bundled too, so it needs **no permissions except vibrate** — not even internet.
- Your save lives in the app's private storage and is written after every move, and again whenever you switch away.
- Haptics use the phone's tuned tick and click effects on Android 10+.
- The back button closes whatever sheet is open, cancels a trinket, or opens the pause menu, before it leaves the game. On Android 16 this goes through the new predictive-back callback.
- It targets Android 16 (API 36), which Google Play requires of new apps, and pads the game clear of the status and navigation bars now that Android draws apps edge to edge.
- **Share result** opens Android's share sheet.

| File | What it does |
| --- | --- |
| `src/app/rollmancer/game/MainActivity.java` | The whole native side: WebView setup, serving the game files, saving, vibration, sharing, back button, edge-to-edge insets, pause/resume |
| `AndroidManifest.xml` | App name, icon, the vibrate permission, portrait screen, version numbers |
| `res/` | Launcher icons (including the Android 8+ adaptive icon and the Android 13+ themed icon) and the dark theme |
| `tools/*.svg` | Sources for the launcher icons |
| `build.sh` | Builds `dist/rollmancer.apk` |
| `build-aab.sh` | Builds `dist/rollmancer.aab`, the format Google Play requires |
| `signing.keystore` | The development signing key (password `rollmancer`) |
| `../rollmancer/js/profile.js` | The game's side of the bridge (it looks for `window.AndroidHost`) |

## Building it

The build uses the Android command-line tools directly (no Gradle or Android Studio). On Ubuntu or Debian:

```sh
sudo apt install openjdk-21-jdk-headless aapt dalvik-exchange zipalign apksigner android-sdk-platform-23 zip
./build.sh
```

`build.sh` copies the game in from `../rollmancer` each time, so after changing the game just run it again.

For the App Bundle, get `bundletool-all-*.jar` from [github.com/google/bundletool/releases](https://github.com/google/bundletool/releases), then:

```sh
./build.sh
BUNDLETOOL=/path/to/bundletool-all.jar ./build-aab.sh
```

The code compiles against the Android 6.0 SDK (the newest one Ubuntu packages); newer APIs (tuned vibration, predictive back) are reached by reflection only on phones that have them.

### Signing keys

`signing.keystore` is committed on purpose, so anyone who builds this project can make an update that installs over a sideloaded copy. **Don't use it for Google Play:** anyone with the repository could sign an update for your listing. Make your own upload key and pass it to both scripts with `KEYSTORE`, `KS_ALIAS` and `KS_PASS`, as described in [`../rollmancer/SELLING.md`](../rollmancer/SELLING.md).

When you release an update, raise `android:versionCode` (and `android:versionName`) in `AndroidManifest.xml` first.
