# BODY.OS: Beyond Existence for Android

The BODY.OS sci-fi RPG as an installable Android app.

**Download:** [`dist/body-os.apk`](dist/body-os.apk) (about 500 KB)

## Installing it

1. Open the APK on your phone (from your browser's downloads, the Files app, or wherever you saved it).
2. Android will say it can't install apps from that source. Tap **Settings**, turn on **Allow from this source**, and go back.
3. Tap **Install**. If Play Protect says it doesn't recognise the app, tap **More details → Install anyway**. It does this for any app that doesn't come from the Play Store.
4. Open **BODY.OS: BEYOND EXISTENCE** from your home screen. It plays in landscape, full screen.

Works on Android 7.0 and newer with an up-to-date Android System WebView (the Play Store updates it automatically) and a phone that supports WebGL, which is almost all of them.

**Updating:** install a newer APK over the old one. Your progress stays, because every build is signed with the same key (`signing.keystore`). Uninstalling the app deletes your save.

## What's in it

The game in [`../body-os-web`](../body-os-web), packaged into a small native app:

- **Fully offline.** The game files are inside the APK and are served to the WebView from a private `https://appassets.androidplatform.net/` address. The app asks for no internet permission at all.
- Progress and settings are saved in the app's own storage, and saved again whenever you switch away.
- Landscape only, full screen. The game keeps its controls clear of notches.
- The **Back** button closes the open menu or pauses the game. On the title screen it exits.
- The phone vibrates for hits, hazards and upgrades (you can turn this off in Settings).

| File | What it does |
| --- | --- |
| `src/com/bodyos/beyondexistence/MainActivity.java` | The WebView, the offline asset server, and the save / vibration / back bridge |
| `AndroidManifest.xml` | App id `com.bodyos.beyondexistence`, landscape, Android 7.0+ |
| `res/` | App name, theme and launcher icons |
| `build.sh` | Builds and signs `dist/body-os.apk` |

## Building it yourself

```
sudo apt install openjdk-21-jdk-headless aapt dalvik-exchange zipalign apksigner android-sdk-platform-23 zip
./build.sh
```
