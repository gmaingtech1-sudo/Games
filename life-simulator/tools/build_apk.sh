#!/usr/bin/env bash
# Builds a signed release APK: build/life-simulator.apk
# Needs Godot 4.4.1 with export templates, and an Android SDK (build-tools with
# apksigner/zipalign) set in Editor Settings > Export > Android. See docs/ANDROID_EXPORT.md.
set -euo pipefail
cd "$(dirname "$0")/.."
GODOT="${GODOT:-godot}"
mkdir -p build
"$GODOT" --headless --path . --import >/dev/null 2>&1 || true
# The signing key that ships with the repo (sideload builds). Keep using the same
# key so new builds install over old ones without losing saves.
export GODOT_ANDROID_KEYSTORE_RELEASE_PATH="$PWD/android/release.keystore"
export GODOT_ANDROID_KEYSTORE_RELEASE_USER="lifesimulator"
export GODOT_ANDROID_KEYSTORE_RELEASE_PASSWORD="lifesimulator"
"$GODOT" --headless --path . --export-release "Android" build/life-simulator.apk
ls -la build/life-simulator.apk
