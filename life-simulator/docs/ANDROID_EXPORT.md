# Building the Android APK

There's a ready-made APK in [`../dist/life-simulator.apk`](../dist/life-simulator.apk). These steps rebuild it.

## Installing the ready-made APK

1. Copy `dist/life-simulator.apk` to your phone, or download it there.
2. Open it. If Android says it can't install apps from that source, tap **Settings**, turn on **Allow from this source**, and go back.
3. Tap **Install**. If Play Protect warns that it doesn't recognise the app, tap **More details → Install anyway**.

It needs Android 7.0 or newer on a 64-bit ARM phone (practically every phone from 2017 on). It uses the Compatibility (OpenGL ES 3.0) renderer for the widest device support. New builds are signed with the same key, so they install over the old version and keep your saves.

## Requirements

* **Godot 4.4.1** (standard build) plus its **export templates**. In the editor, use Editor → Manage Export Templates → Download. On the command line, unpack `Godot_v4.4.1-stable_export_templates.tpz` into `~/.local/share/godot/export_templates/4.4.1.stable/`.
* **JDK 17 or newer.**
* **Android SDK** with `build-tools` (for `apksigner` and `zipalign`) and `platform-tools`. Android Studio's SDK Manager works, as does the command-line `sdkmanager`.
* In Godot: Editor → Editor Settings → Export → Android, set **Java SDK Path** and **Android SDK Path**. Godot also wants a **debug keystore**. It creates one, or you can make your own:
  ```sh
  keytool -genkeypair -keystore debug.keystore -storepass android -alias androiddebugkey \
          -keypass android -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Android Debug,O=Android,C=US"
  ```

## Building

### Command line

```sh
tools/build_apk.sh            # writes build/life-simulator.apk
```

The script imports the project, then runs
`godot --headless --path . --export-release "Android" build/life-simulator.apk`,
signing with `android/release.keystore`. It passes the key with the `GODOT_ANDROID_KEYSTORE_RELEASE_*` environment variables.

### Editor

Project → Export → **Android** → Export Project. For a signed release build, fill in Keystore → Release with `android/release.keystore`, user `lifesimulator` and password `lifesimulator`.

## The export preset

`export_presets.cfg` → **Android**:

| Setting | Value |
| --- | --- |
| Package | `com.lifesimulator.game`, "Life Simulator", version 1.0.0 (code 1) |
| Gradle build | Off (uses Godot's prebuilt template, so no Gradle or Android Studio is needed) |
| Architectures | arm64-v8a. You can also enable armeabi-v7a for very old 32-bit phones, which roughly doubles the size. |
| Orientation | Sensor landscape (project setting `display/window/handheld/orientation`) |
| Screen | Immersive mode, every screen size supported |
| Permissions | INTERNET, ACCESS_NETWORK_STATE, ACCESS_WIFI_STATE (multiplayer), VIBRATE (haptics) |
| Icons | `assets/ui/icon_192.png` plus adaptive foreground and background |
| Included files | All resources plus `*.json` (the game data). Tests, tools and docs are excluded. |

## Signing key

`android/release.keystore` (alias `lifesimulator`, password `lifesimulator`) ships in the repository so anyone can build updates that install over earlier versions. That's fine for sideloading. **For Google Play, create your own private key and keep it secret.** Play also requires an App Bundle: turn on Gradle build (Project → Install Android Build Template) and set the export format to AAB.

## Android-specific behaviour

* **Back button.** It closes the top menu, otherwise opens the pause menu. On the main menu it asks before exiting (`application/config/quit_on_go_back=false`).
* **Saving.** The game saves when it goes to the background (`NOTIFICATION_APPLICATION_PAUSED`).
* **Multi-touch.** The joystick, buttons and camera drag read touch events directly, so you can move, look and press buttons at the same time.
* **Graphics presets** (Settings):

| Preset | Shadows | Render scale | View distance | People | Traffic | FPS cap |
| --- | --- | --- | --- | --- | --- | --- |
| Low | Off | 70% | 170 m | 8 | 5 | 30 |
| Medium (default) | On | 85% | 240 m | 12 | 8 | 30 |
| High | On | 100% | 340 m | 16 | 12 | 60 |

* **Performance.** The whole city is drawn with MultiMesh batches (about 60 draw calls for every building, tree, lamp and prop), and it uses one custom facade shader with a single texture. The minimap is 2D drawing rather than a second camera. Residents far from the camera run their routines cheaply.
