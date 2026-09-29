#!/usr/bin/env bash
# Builds dist/pocket-mochi.aab: the Android App Bundle format Google Play
# requires for new apps (an .apk, as built by build.sh, can't be uploaded
# to a fresh Play Console listing). Run build.sh first — this reuses its
# compiled classes.dex and res.zip rather than rebuilding them.
set -euo pipefail
cd "$(dirname "$0")"

ANDROID_JAR="${ANDROID_JAR:-/usr/lib/android-sdk/platforms/android-23/android.jar}"
BUNDLETOOL="${BUNDLETOOL:-bundletool.jar}"
BUILD=build
BAB="$BUILD/bundle"
OUT=dist/pocket-mochi.aab

for tool in aapt2 jarsigner zip unzip; do
  command -v "$tool" >/dev/null || { echo "Missing $tool"; exit 1; }
done
[ -f "$ANDROID_JAR" ] || { echo "Missing $ANDROID_JAR (set ANDROID_JAR)"; exit 1; }
[ -f "$BUNDLETOOL" ] || { echo "Missing $BUNDLETOOL (set BUNDLETOOL to the bundletool-all jar)"; exit 1; }
[ -f "$BUILD/res.zip" ] || { echo "Run build.sh first (needs $BUILD/res.zip)"; exit 1; }
[ -f "$BUILD/classes.dex" ] || { echo "Run build.sh first (needs $BUILD/classes.dex)"; exit 1; }

rm -rf "$BAB"
mkdir -p "$BAB/proto" "$BAB/base/manifest" "$BAB/base/dex" dist

echo "1/4 Linking resources in protobuf format (what an App Bundle module needs)"
aapt2 link -I "$ANDROID_JAR" --proto-format --manifest AndroidManifest.xml \
  -A "$BUILD/assets" -o "$BAB/proto/base.apk" "$BUILD/res.zip"

echo "2/4 Assembling the base module"
(cd "$BAB/proto" && unzip -q base.apk -d unpacked)
mv "$BAB/proto/unpacked/AndroidManifest.xml" "$BAB/base/manifest/AndroidManifest.xml"
mv "$BAB/proto/unpacked/resources.pb" "$BAB/base/resources.pb"
[ -d "$BAB/proto/unpacked/res" ] && mv "$BAB/proto/unpacked/res" "$BAB/base/res"
[ -d "$BAB/proto/unpacked/assets" ] && mv "$BAB/proto/unpacked/assets" "$BAB/base/assets"
cp "$BUILD/classes.dex" "$BAB/base/dex/classes.dex"

echo "3/4 Building the .aab"
(cd "$BAB/base" && zip -qr -X ../base.zip manifest dex res resources.pb assets)
java -jar "$BUNDLETOOL" build-bundle --modules="$BAB/base.zip" --output="$BAB/unsigned.aab" --overwrite

echo "4/4 Signing"
cp "$BAB/unsigned.aab" "$OUT"
jarsigner -keystore signing.keystore -storepass pocketmochi -keypass pocketmochi \
  -sigalg SHA256withRSA -digestalg SHA-256 "$OUT" pocketmochi
jarsigner -verify "$OUT" >/dev/null && echo "Signature verified"

echo "Built $OUT ($(du -k "$OUT" | cut -f1) KB)"
