# Paranormal World (CaseLink)

A native Android app for logging paranormal investigations. CaseLink keeps each case's
observations in a factual timeline: what was seen, heard or measured, plus possible ordinary
explanations. It never labels anything as proof.

Built with Kotlin, Jetpack Compose and Material 3. Everything is stored on the phone; there are
no accounts, cloud services or API keys.

**Download:** [`dist/paranormal-world.apk`](dist/paranormal-world.apk) (version 1.0.1)

## Installing it

1. Open the APK on your phone (from your browser's downloads, the Files app, or wherever you downloaded it).
2. Android will say it can't install apps from that source. Tap **Settings**, turn on **Allow from this source**, and go back.
3. Tap **Install**. If Play Protect warns that it doesn't recognize the app, tap **More details → Install anyway**. It often warns about apps that don't come from the Play Store.
4. Open **Paranormal World** from your home screen.

Works on Android 8.0 and newer.

**Updating:** install a newer APK right over the old one. Your cases stay, because every release is
signed with the same key (`signing.keystore`). Uninstalling the app deletes your cases.

If you installed a build from Android Studio or from a GitHub Actions run before, uninstall that one
first: those are signed with a different (debug) key, so Android won't install this one over it.

## Build stages

The app is built in small stages, each one buildable and testable on its own.

| Stage | What it adds | Status |
| --- | --- | --- |
| 1 | Project setup, dark theme, Home screen with the empty state | Done |
| 2 | Room database: investigations and observations tables, DAOs, repository; Home lists saved cases; demo case button | Done |
| 3 | Navigation and the Create/Edit Case screen, with validation and unit tests | Done |
| 4 | Case Detail screen | Done |
| 5 | Add/Edit Observation screen, with validation and unit tests | Done |
| 6 | Case Timeline screen: chronological, edit and delete with confirmation | Done |
| 7 | Device tests on an emulator: database tests and a tap-through of the main journey | Done |
| + | Delete a case (with its observations) from Case Detail, after confirmation | Done |
| 8 | Signed release APK; "Discard changes?" warning when leaving a form with unsaved changes | Done |

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
            ├── ui/timeline/     Case Timeline screen and its ViewModel
            ├── ui/components/   Small pieces of UI shared by several screens
            ├── ui/theme/        Colours, text styles, the Material 3 theme
            └── ui/home/         HomeScreen and HomeViewModel
```

## Tests

| Kind | Where | Run with | What they check |
| --- | --- | --- | --- |
| Unit tests | `app/src/test/` | `./gradlew testDebugUnitTest` | Form validation, saving and editing forms, grouping the timeline by day. Run on your computer, no phone needed. |
| Device tests | `app/src/androidTest/` | `./gradlew connectedDebugAndroidTest` | The real Room database (saving, timestamps, chronological order, delete, cascade, demo labels) and a tap-through: create a case, add an observation, see it on the timeline, delete it, then delete the case; leaving a half-filled form asks before discarding. |

**Run device tests on an emulator, not on your own phone.** The tap-through test uses the app's real
database, and Gradle uninstalls the app when the tests finish, which deletes its saved cases.

Later stages add one folder per screen under `ui/`.

## Demo data

The empty Home screen has an **Add a demo case (sample data)** button. Everything it creates is
marked `[DEMO]` and set at a fictional location, so it can't be mistaken for a real case.

## Building

To make the signed APK: `./gradlew assembleRelease` (it lands in `app/build/outputs/apk/release/`).
On GitHub, running the workflow by hand (**Actions → Paranormal World Android → Run workflow**)
builds it and commits it to `dist/paranormal-world.apk`.

Open this `paranormal-world-android` folder (not the repository root) in Android Studio and
press **Run**. From a terminal: `./gradlew assembleDebug` (`gradlew.bat assembleDebug` on Windows).
The APK lands in `app/build/outputs/apk/debug/`.

Every push that changes this folder is also built by the
[Paranormal World Android workflow](../.github/workflows/paranormal-world-android.yml), which
runs the unit tests and lint, and attaches the debug APK to the run.

Versions: Android Gradle Plugin 8.7.3, Gradle 8.11.1, Kotlin 2.0.21, KSP 2.0.21-1.0.28, Room 2.6.1,
Navigation 2.8.5, Compose BOM 2024.12.01,
compileSdk/targetSdk 35, minSdk 26 (Android 8.0).
