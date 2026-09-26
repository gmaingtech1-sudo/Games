# Riftborn for Android

The Riftborn AR game as a regular Android app: download the APK, install it, and it gets its own icon on your home screen. No app store, and no web hosting needed.

**Download:** [`dist/riftborn.apk`](dist/riftborn.apk) (about 800 KB)

## Installing it

1. Open the APK on your phone (from your browser's downloads, the Files app, or wherever you saved it).
2. Android will say it can't install apps from that source. Tap **Settings**, turn on **Allow from this source**, and go back.
3. Tap **Install**. If Play Protect warns that it doesn't recognise the app, tap **More details → Install anyway**. It often warns about apps that don't come from the Play Store.
4. Open **Riftborn**, make your agent, and tap **Turn on location and start**. Android asks for location access: pick **While using the app** (and **Precise**, so you can reach things 60 m away). Android asks for the camera the first time you engage a creature. If you say no, you see the Rift plain instead of your camera.

Then go for a walk. Like Ingress, you move in the game only by moving in real life.

Works on Android 7.0 and newer with an up-to-date Android System WebView (the Play Store updates it automatically). The street map needs mobile data or Wi-Fi; without it you play on plain ground.

If you turned location off by mistake: **Settings → Apps → Riftborn → Permissions → Location → Allow only while using the app**, then tap **Try again** in the game.

**Updating:** install a newer APK right over the old one. Your progress stays, because every build is signed with the same key (`signing.keystore`). Uninstalling the app deletes your progress.

## What's in it

It's the same game as the web version in [`../riftborn`](../riftborn), packaged into a small native app:

- The game files, including the 3D engine, are inside the APK. The app serves them to its WebView from a private `https://appassets.androidplatform.net/` address, which counts as a secure page, so GPS and the camera work. Only the map tiles (Google Maps with a key, CARTO otherwise) and fonts come from the internet.
- The game's location and camera requests are passed on to Android's own permission prompts. Your location and camera picture stay on the phone.
- Your progress is saved in the app's own storage.
- The screen stays on while you play.
- Vibration uses the phone's tuned click and tick effects on Android 10+.
- The back button closes a panel or leaves an encounter before it leaves the app.

| File | What it does |
| --- | --- |
| `src/app/riftborn/game/MainActivity.java` | The native side: WebView setup, serving the game files, location and camera permissions, saving, vibration, back button, pause/resume |
| `AndroidManifest.xml` | App name, icon, permissions (location, camera, internet for map tiles and fonts, vibration), portrait screen |
| `res/` | Launcher icons (including the Android 8+ adaptive icon and the Android 13+ themed icon) and the dark theme |
| `build.sh` | Builds `dist/riftborn.apk` |
| `signing.keystore` | The key the APK is signed with |
| `../riftborn/js/host.js` | The game's side of the bridge (it looks for `window.AndroidHost`) |

## Building it

The build uses the Android command-line tools directly (no Gradle or Android Studio). On Ubuntu or Debian:

```sh
sudo apt install openjdk-21-jdk-headless aapt dalvik-exchange zipalign apksigner android-sdk-platform-23 zip
./build.sh
```

`build.sh` copies the game in from `../riftborn` each time, so after changing the game just run it again.

To build with Google Maps turned on, pass your key: `GOOGLE_MAPS_KEY=AIza... ./build.sh`. Restrict the key to the Map Tiles API and to `https://appassets.androidplatform.net/*` (see [Google Maps](../riftborn/README.md#google-maps)). Players can also add a key in the app under **Menu → Google Maps**.

### About the signing key

`signing.keystore` (password `riftbornapp`) is committed on purpose, like Pet Cam's. It lets anyone who builds this project produce an update that installs over your existing app. That's fine for a personal app you install yourself. Before publishing to the Google Play Store, create a new private key and keep it out of the repository.
