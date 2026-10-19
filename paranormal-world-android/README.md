# Paranormal World (CaseLink)

A native Android app for logging paranormal investigations. CaseLink keeps each case's
observations in a factual timeline: what was seen, heard or measured, plus possible ordinary
explanations. It never labels anything as proof.

Built with Kotlin, Jetpack Compose and Material 3. Everything is stored on the phone; there are
no accounts, cloud services or API keys.

## Build stages

The app is built in small stages, each one buildable and testable on its own.

| Stage | What it adds | Status |
| --- | --- | --- |
| 1 | Project setup, dark theme, Home screen with the empty state | Done |
| 2 | Room database: investigations and observations tables, DAOs, repository | Next |
| 3 | Navigation and the Create/Edit Case screen, with validation | |
| 4 | Case Detail screen | |
| 5 | Add/Edit Observation screen | |
| 6 | Case Timeline screen: chronological, edit and delete with confirmation | |
| 7 | Clearly marked demo data, final polish | |

## Project layout

```
paranormal-world-android/
├── settings.gradle.kts          Where to download libraries; lists the :app module
├── build.gradle.kts             Top-level build file (declares plugins)
├── gradle.properties            Gradle settings
├── gradle/libs.versions.toml    Every library version, in one place
├── gradlew, gradlew.bat, gradle/wrapper/   The Gradle wrapper (downloads the right Gradle)
└── app/
    ├── build.gradle.kts         App ID, Android versions, dependencies
    └── src/main/
        ├── AndroidManifest.xml  App name, icon, first screen
        ├── res/                 Strings, colours, launcher icon, startup theme
        └── java/com/paranormalworld/app/
            ├── MainActivity.kt  Starts the app and shows the Compose UI
            ├── ui/theme/        Colours, text styles, the Material 3 theme
            └── ui/home/         HomeScreen
```

Later stages add `data/` (database) and one folder per screen under `ui/`.

## Building

Open this `paranormal-world-android` folder (not the repository root) in Android Studio and
press **Run**. From a terminal: `./gradlew assembleDebug` (`gradlew.bat assembleDebug` on Windows).
The APK lands in `app/build/outputs/apk/debug/`.

Every push that changes this folder is also built by the
[Paranormal World Android workflow](../.github/workflows/paranormal-world-android.yml), which
runs lint and attaches the debug APK to the run.

Versions: Android Gradle Plugin 8.7.3, Gradle 8.11.1, Kotlin 2.0.21, Compose BOM 2024.12.01,
compileSdk/targetSdk 35, minSdk 26 (Android 8.0).
