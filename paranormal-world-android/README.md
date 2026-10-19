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
| 2 | Room database: investigations and observations tables, DAOs, repository; Home lists saved cases; demo case button | Done |
| 3 | Navigation and the Create/Edit Case screen, with validation and unit tests | Done |
| 4 | Case Detail screen | Done |
| 5 | Add/Edit Observation screen, with validation and unit tests | Done |
| 6 | Case Timeline screen: chronological, edit and delete with confirmation | Next |
| 7 | Final polish and testing | |

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
            ├── ParanormalWorldApp.kt  Creates the database once, when the app starts
            ├── data/            Room entities, DAOs, database, CaseRepository
            ├── ui/navigation/   Routes and the NavHost that switches screens
            ├── ui/createcase/   Create/Edit Case screen, its ViewModel and form validation
            ├── ui/casedetail/   Case Detail screen and its ViewModel
            ├── ui/addobservation/  Add/Edit Observation screen, its ViewModel and validation
            ├── ui/components/   Small pieces of UI shared by several screens
            ├── ui/theme/        Colours, text styles, the Material 3 theme
            └── ui/home/         HomeScreen and HomeViewModel
```

Unit tests live in `app/src/test/` and run on your computer: `./gradlew testDebugUnitTest`.
Later stages add one folder per screen under `ui/`.

## Demo data

The empty Home screen has an **Add a demo case (sample data)** button. Everything it creates is
marked `[DEMO]` and set at a fictional location, so it can't be mistaken for a real case.

## Building

Open this `paranormal-world-android` folder (not the repository root) in Android Studio and
press **Run**. From a terminal: `./gradlew assembleDebug` (`gradlew.bat assembleDebug` on Windows).
The APK lands in `app/build/outputs/apk/debug/`.

Every push that changes this folder is also built by the
[Paranormal World Android workflow](../.github/workflows/paranormal-world-android.yml), which
runs the unit tests and lint, and attaches the debug APK to the run.

Versions: Android Gradle Plugin 8.7.3, Gradle 8.11.1, Kotlin 2.0.21, KSP 2.0.21-1.0.28, Room 2.6.1,
Navigation 2.8.5, Compose BOM 2024.12.01,
compileSdk/targetSdk 35, minSdk 26 (Android 8.0).
