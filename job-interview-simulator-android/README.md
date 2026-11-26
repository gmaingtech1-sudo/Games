# Job Interview Simulator for Android

The [Job Interview Simulator](../job-interview-simulator/) game as an installable Android app.

**Download:** [`dist/job-interview-simulator.apk`](dist/job-interview-simulator.apk) (about 260 KB, version 1.0)

## Installing it

1. Open the APK on your phone (from your browser's downloads or the Files app).
2. If Android says it can't install apps from that source, tap **Settings**, turn on **Allow from this source**, and go back.
3. Tap **Install**. If Play Protect says it doesn't recognise the app, tap **More details → Install anyway**.
4. Open **Job Interview Sim** from your home screen.

Works on Android 7.0 and newer. It's fully offline (no internet permission).

## Building it

```sh
sudo apt install openjdk-21-jdk-headless aapt dalvik-exchange zipalign apksigner android-sdk-platform-23 zip
./build.sh
```

`build.sh` copies the game in from `../job-interview-simulator` each time. `signing.keystore` (password `interview`) is committed so later builds install over the top of earlier ones.
