# Portal Hackers: Nexus for Android

Portal Hackers: Nexus as a regular Android app: download the APK, install it, and it gets its own icon on your home screen. No app store, and no HTTPS hosting needed for GPS.

**Download:** [`dist/portal-hackers.apk`](dist/portal-hackers.apk) (about 490 KB). For Google Play, see [PLAY-STORE.md](PLAY-STORE.md) and the App Bundle [`dist/portal-hackers.aab`](dist/portal-hackers.aab).

## Installing it

1. Open the APK on your phone (from your browser's downloads, the Files app, or wherever you downloaded it).
2. Android will say it can't install apps from that source. Tap **Settings**, turn on **Allow from this source**, and go back.
3. Tap **Install**. If Play Protect warns that it doesn't recognize the app, tap **More details → Install anyway**. It often warns about apps that don't come from the Play Store.
4. Open **Portal Hackers**, sign up, pick your team and avatar, then tap **Use my location**. Android asks once for location access. If you say no, you tap the compass to walk instead. You can turn location on later in **Settings → Apps → Portal Hackers → Permissions**.

Works on Android 7.0 and newer, as long as Android System WebView is up to date (the Play Store updates it automatically). On phones with a compass sensor the radar turns with the phone; without one, north stays up.

**Updating:** install a newer APK right over the old one. Your progress stays, because every build is signed with the same private key. Uninstalling the app deletes your progress.

**Coming from version 1.3 or older?** Those were signed with a different key, so Android won't install 1.4 over them: uninstall the old app first (this deletes its progress), then install the new one.

## What's in it

It's the same game as the web version in [`../portal-hackers`](../portal-hackers), packaged into a small native app:

- The game files are inside the APK. The app serves them to its WebView from a private `https://appassets.androidplatform.net/` address, which counts as a secure page, so GPS works without hosting. Only the fonts come from Google Fonts, and it falls back to the phone's font without a connection.
- Your location stays on the phone.
- Your accounts and progress are saved in the app's own storage.
- Team chat needs the internet; it connects phones through PeerJS's public server, then directly.
- The screen stays on while you play.
- The back button aborts a hack or closes a panel before it leaves the app.

| File | What it does |
| --- | --- |
| `src/app/portalhackers/game/MainActivity.java` | The native side: WebView setup, serving the game files, location permission, back button |
| `AndroidManifest.xml` | App name, icon, permissions (location, internet for fonts and team chat, vibration), portrait screen |
| `res/` | Launcher icons (including the Android 8+ adaptive icon and the Android 13+ themed icon) and the dark theme |
| `build.sh` | Builds `dist/portal-hackers.apk` |
| `build-aab.sh` | Builds `dist/portal-hackers.aab`, the App Bundle for Google Play |
| `PLAY-STORE.md` | How to publish on Google Play, the store listing text, and the YouTube copy |
| `store/` | Store icon, feature graphic, screenshots, the trailer and its YouTube thumbnail |

## Building it

```sh
sudo apt install openjdk-21-jdk-headless aapt dalvik-exchange zipalign apksigner android-sdk-platform-23 zip
export KEYSTORE=/path/to/portal-hackers-upload.jks KEYSTORE_PASS='your key password'
./build.sh                                              # dist/portal-hackers.apk
BUNDLETOOL=/path/to/bundletool-all.jar ./build-aab.sh   # dist/portal-hackers.aab (run build.sh first)
```

Both copy the current game from `../portal-hackers`, so rebuild after changing the game. Get bundletool from [its releases page](https://github.com/google/bundletool/releases).

### The signing key

Builds are signed with a **private** key, `portal-hackers-upload.jks` (alias `upload`), which is **not in this repository** because the repository is public: anyone with the key could publish an update as you. It's also your Google Play upload key and the key registered for Android developer verification. Keep it and its password safe, and back them up. `.gitignore` stops `.jks` and `.keystore` files being committed.

Versions up to 1.3 were signed with a key that was committed here; that key is no longer used.
