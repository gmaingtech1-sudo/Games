#!/usr/bin/env bash
# Builds dist/job-interview-simulator.apk: the web game from ../job-interview-simulator
# packaged into the small native Android shell in src/.
#
# Needs a JDK and the Android build tools. On Ubuntu/Debian:
#   sudo apt install openjdk-21-jdk-headless aapt dalvik-exchange zipalign apksigner android-sdk-platform-23 zip
set -euo pipefail
cd "$(dirname "$0")"

ANDROID_JAR="${ANDROID_JAR:-/usr/lib/android-sdk/platforms/android-23/android.jar}"
DX="${DX:-$(command -v dalvik-exchange || command -v dx || true)}"
BUILD=build
OUT=dist/job-interview-simulator.apk

for tool in aapt2 javac zipalign apksigner zip keytool; do
  command -v "$tool" >/dev/null || { echo "Missing $tool (see the top of this script)"; exit 1; }
done
[ -n "$DX" ] || { echo "Missing dx/dalvik-exchange (see the top of this script)"; exit 1; }
[ -f "$ANDROID_JAR" ] || { echo "Missing $ANDROID_JAR (set ANDROID_JAR)"; exit 1; }

if [ ! -f signing.keystore ]; then
  echo "Creating signing.keystore"
  keytool -genkeypair -keystore signing.keystore -storepass interview -keypass interview \
    -alias interview -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Job Interview Simulator" >/dev/null
fi

rm -rf "$BUILD"
mkdir -p "$BUILD/gen" "$BUILD/classes" "$BUILD/assets/game" dist

echo "1/5 Copying the game from ../job-interview-simulator"
cp -R ../job-interview-simulator/index.html ../job-interview-simulator/css ../job-interview-simulator/js "$BUILD/assets/game/"

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
apksigner sign --ks signing.keystore --ks-pass pass:interview --key-pass pass:interview \
  --ks-key-alias interview --out "$OUT" "$BUILD/aligned.apk"
apksigner verify "$OUT"
rm -f "$OUT.idsig"

echo "Built $OUT ($(du -k "$OUT" | cut -f1) KB)"
