#!/usr/bin/env bash
# Builds dist/riftborn.apk: the web game from ../riftborn packaged into the
# small native Android shell in src/. Set GOOGLE_MAPS_KEY to build with
# Google Maps turned on.
#
# Needs a JDK and the Android build tools. On Ubuntu/Debian:
#   sudo apt install openjdk-21-jdk-headless aapt dalvik-exchange zipalign apksigner android-sdk-platform-23 zip
# Point ANDROID_JAR somewhere else to use a different SDK platform.
set -euo pipefail
cd "$(dirname "$0")"

ANDROID_JAR="${ANDROID_JAR:-/usr/lib/android-sdk/platforms/android-23/android.jar}"
DX="${DX:-$(command -v dalvik-exchange || command -v dx || true)}"
BUILD=build
OUT=dist/riftborn.apk

for tool in aapt2 javac zipalign apksigner zip; do
  command -v "$tool" >/dev/null || { echo "Missing $tool (see the top of this script)"; exit 1; }
done
[ -n "$DX" ] || { echo "Missing dx/dalvik-exchange (see the top of this script)"; exit 1; }
[ -f "$ANDROID_JAR" ] || { echo "Missing $ANDROID_JAR (set ANDROID_JAR)"; exit 1; }

rm -rf "$BUILD"
mkdir -p "$BUILD/gen" "$BUILD/classes" "$BUILD/assets/game" dist

echo "1/5 Copying the game from ../riftborn"
cp -R ../riftborn/index.html ../riftborn/config.js ../riftborn/css ../riftborn/js ../riftborn/icons ../riftborn/vendor "$BUILD/assets/game/"
# Optional: bake a Google Maps key into this build (GOOGLE_MAPS_KEY=... ./build.sh).
if [ -n "${GOOGLE_MAPS_KEY:-}" ]; then
  sed -i "s#googleMapsKey: ''#googleMapsKey: '${GOOGLE_MAPS_KEY}'#" "$BUILD/assets/game/config.js"
  echo "    with your Google Maps key"
fi
# Optional: online accounts through your Firebase project.
if [ -n "${FIREBASE_API_KEY:-}" ] && [ -n "${FIREBASE_PROJECT_ID:-}" ]; then
  sed -i "s#firebase: { apiKey: '', projectId: '' }#firebase: { apiKey: '${FIREBASE_API_KEY}', projectId: '${FIREBASE_PROJECT_ID}' }#" "$BUILD/assets/game/config.js"
  echo "    with online accounts (Firebase project ${FIREBASE_PROJECT_ID})"
fi

echo "2/5 Compiling resources"
aapt2 compile --dir res -o "$BUILD/res.zip"
aapt2 link -I "$ANDROID_JAR" --manifest AndroidManifest.xml -A "$BUILD/assets" \
  --java "$BUILD/gen" -o "$BUILD/unsigned.apk" "$BUILD/res.zip"

echo "3/5 Compiling Java"
javac -source 8 -target 8 -Xlint:-options -encoding UTF-8 -bootclasspath "$ANDROID_JAR" \
  -d "$BUILD/classes" $(find src "$BUILD/gen" -name '*.java')

echo "4/5 Converting to Android bytecode"
"$DX" --dex --min-sdk-version=24 --output="$BUILD/classes.dex" "$BUILD/classes"
(cd "$BUILD" && zip -q unsigned.apk classes.dex)

echo "5/5 Aligning and signing"
zipalign -f -p 4 "$BUILD/unsigned.apk" "$BUILD/aligned.apk"
apksigner sign --ks signing.keystore --ks-pass pass:riftbornapp --key-pass pass:riftbornapp \
  --ks-key-alias riftborn --out "$OUT" "$BUILD/aligned.apk"
apksigner verify "$OUT"
rm -f "$OUT.idsig"

echo "Built $OUT ($(du -k "$OUT" | cut -f1) KB)"
