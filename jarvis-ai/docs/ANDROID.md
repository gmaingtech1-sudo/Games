# JARVIS AI for Android

## Install the APK on your phone

1. On your phone, open the project on GitHub, go to `jarvis-ai/android/dist/jarvis-ai.apk`, and tap **Download** (the "download raw file" button). Or copy the file from your PC via USB.
2. Open the downloaded file (from the browser's downloads, or the Files app).
3. Android says it can't install apps from this source. Tap **Settings**, turn on **Allow from this source**, then go back.
4. Tap **Install**. If Play Protect says it doesn't recognise the app, tap **More details > Install anyway**. It warns about any app not from the Play Store.
5. Open **JARVIS AI** from your home screen. Enter your server address (for example `https://jarvis-yourname.fly.dev`), your pairing password and a device name, then tap **Connect**.

Requirements: Android 8.0 or newer with an up-to-date **Android System WebView** (the Play Store updates it automatically).

**Updating:** install a newer APK over the old one. The app keeps its pairing, because every build is signed with the same key (`android/jarvis-sideload.keystore`).

## Using it

- **Microphone**: the first tap asks for microphone permission. JARVIS uses your phone's speech recogniser (usually Google's). Some phones send audio to Google for recognition. To keep it on the phone, download offline speech in your phone's settings (Google app > Settings > Voice > Offline speech recognition). Only the recognised *text* is sent to your JARVIS server.
- **Voice replies** use your phone's text-to-speech engine. Pick a voice, speed, pitch and volume in Settings > Voice. More voices: phone Settings > Accessibility/System > Text-to-speech.
- **Back button** closes open panels first, then leaves the app.
- **Attach** (paperclip) adds a text or code file from your phone to the message.
- The interface itself is stored inside the APK and works offline; only chatting needs your server.

### Permissions and battery

| Permission | Why | When |
|---|---|---|
| Internet | To reach your JARVIS server | Always (no prompt) |
| Microphone | Voice input | Asked the first time you tap the mic; you can turn it off in phone Settings > Apps > JARVIS AI > Permissions |

- The microphone is only on while the mic button is lit, or while **wake-word listening** is on *and* JARVIS is open on screen. It switches off as soon as you leave the app (JARVIS never records in the background).
- Wake-word listening keeps the microphone and speech recogniser running, so it uses noticeably more battery. Leave it off if you don't need it. See [VOICE.md](VOICE.md).
- The animated interface caps its frame rate, slows down when idle and stops completely in the background. **Settings > Appearance > Effects > Battery saver** reduces it further.

## Build the APK yourself on Windows

You only need this to change the app. The ready-made APK is in `android/dist/`, and GitHub Actions builds new ones on every push (**Actions** tab > **JARVIS AI** run > *Artifacts* > `jarvis-ai-android-apk`).

### With Android Studio (easiest)

1. Install **Android Studio** from [developer.android.com/studio](https://developer.android.com/studio), with the default options. It includes the Android SDK and a suitable Java.
2. Get the project: `git clone https://github.com/gmaingtech1-sudo/Games`, or *Code > Download ZIP* on GitHub and unzip it.
3. In Android Studio choose **File > Open**, select the `Games\jarvis-ai\android` folder (the one containing `settings.gradle.kts`), then **Trust Project**.
4. Wait for **Gradle sync** to finish (bottom status bar). The first time, it downloads the Android Gradle Plugin and SDK parts. If it offers to install missing SDK platform 35 or build tools, accept. If it offers to upgrade the Android Gradle Plugin, you may accept or skip.
5. **Build > Build App Bundle(s) / APK(s) > Build APK(s)**. When it finishes, click **locate**. The file is `app\build\outputs\apk\debug\app-debug.apk`.
6. Install it: copy it to the phone as above, or connect the phone by USB (enable *Developer options > USB debugging*) and press the green ▶ **Run** button.

The shared interface (`jarvis-ai/shared/ui`) is copied into the APK automatically during the build, so edit it there, not in the Android folder.

### From the command line

```bat
cd Games\jarvis-ai\android
gradlew.bat assembleDebug          :: app\build\outputs\apk\debug\app-debug.apk
gradlew.bat testDebugUnitTest      :: unit + Robolectric tests
```
This needs the Android SDK. The simplest way to get it is to install Android Studio once; the build then finds the SDK through `local.properties` (Android Studio creates it).

### A signed release APK with your own key

The debug and release builds are signed with the committed *sideload* key by default. That's convenient for a personal app, but anyone with this repository has that key. To sign with your own private key:

1. Create a key, either via **Build > Generate Signed App Bundle / APK > APK > Create new…** in Android Studio, or with:
   ```bat
   keytool -genkeypair -v -keystore my-release.keystore -alias jarvis -keyalg RSA -keysize 3072 -validity 10000
   ```
   Keep the keystore file and passwords safe (a password manager plus a backup). Losing them means you can't update the app.
2. Put the keystore in `jarvis-ai\android\` and create `jarvis-ai\android\keystore.properties` (both are git-ignored):
   ```properties
   storeFile=my-release.keystore
   storePassword=your-store-password
   keyAlias=jarvis
   keyPassword=your-key-password
   ```
3. Build: `gradlew.bat assembleRelease` gives `app\build\outputs\apk\release\app-release.apk`, minified with R8 and signed with your key. Check it with `apksigner verify --print-certs app-release.apk` (apksigner is in the SDK's `build-tools` folder).
4. A phone with the sideload-signed version installed must **uninstall it first**, because Android refuses an update signed with a different key. You'll only need to pair again; your data is on the server.

For Google Play you'd upload an App Bundle (`gradlew.bat bundleRelease`) and use Play App Signing. This project isn't set up as a Play Store listing.

### How the APK in `dist/` was built

It was built without Gradle (`android/build-cli.sh`) in an environment that couldn't reach Google's download servers. The script compiles **the same source files**: Kotlin 2.2, the resources, the manifest and the shared UI, using Ubuntu's Android build tools. Its differences from a Gradle build:
- It compiles against the Android 13 framework (API 33) rather than 35.
- It skips R8 shrinking, so it's a little larger.

The Gradle build itself (`assembleDebug`, `assembleRelease`, unit and Robolectric tests) runs and passes on GitHub Actions.

## Source code tour

| File | What it does |
|---|---|
| `app/src/main/java/.../MainActivity.kt` | WebView host, bridge dispatcher, permissions, file picker/export, back button, splash, insets |
| `SpeechInput.kt` | Android `SpeechRecognizer`: partial results, mic level, error mapping |
| `SpeechOutput.kt` | Android `TextToSpeech`: voices, queued sentences, speed/pitch/volume |
| `SecureStore.kt` | AES-GCM encryption with a key in the Android Keystore (the device token) |
| `AssetServer.kt` | Serves the bundled UI from `https://appassets.androidplatform.net/ui/` |
| `TextFiles.kt` | Attachment rules (size, binary detection, encodings), link filtering |
| `app/src/test/...` | `TextFilesTest` (JVM) and `MainActivityTest` (Robolectric) |
| `res/` | Adaptive + themed icon, splash, themes, network security config |
