#!/usr/bin/env bash
# Builds the JARVIS AI APK WITHOUT Gradle or Android Studio, from exactly the
# same sources (app/src/main) the Gradle build uses. This is how the APK in
# dist/ was produced in an environment that cannot reach Google's servers.
# On your own PC, use Android Studio or ./gradlew assembleDebug instead (see
# docs/ANDROID.md).
#
# Needs (Ubuntu/Debian):
#   sudo apt install openjdk-21-jdk-headless aapt dalvik-exchange zipalign apksigner zip
# plus, from Maven Central:
#   ANDROID_JAR  an Android API 33 framework jar with resources, e.g. Robolectric's
#                org.robolectric:android-all:13-robolectric-9030017
#   KOTLIN_LIB   folder with kotlin-compiler-embeddable 2.2.21 and its dependencies
#   KOTLIN_STDLIB  kotlin-stdlib-2.2.21.jar
set -euo pipefail
cd "$(dirname "$0")"

ANDROID_JAR="${ANDROID_JAR:-/opt/sdkwork/android-all-13.jar}"
KOTLIN_LIB="${KOTLIN_LIB:-/opt/kotlinc/lib}"
KOTLIN_STDLIB="${KOTLIN_STDLIB:-/opt/kotlinc/stdlib/lib/kotlin-stdlib-2.2.21.jar}"
DX="${DX:-$(command -v dalvik-exchange || command -v dx || true)}"
APP=app/src/main
BUILD=build/cli
OUT=dist/jarvis-ai.apk

VERSION_CODE=$(sed -n 's/.*versionCode = \([0-9]*\).*/\1/p' app/build.gradle.kts)
VERSION_NAME=$(sed -n 's/.*versionName = "\(.*\)".*/\1/p' app/build.gradle.kts)
PACKAGE=$(sed -n 's/.*applicationId = "\(.*\)".*/\1/p' app/build.gradle.kts)

for tool in aapt2 java javac zipalign apksigner zip; do
  command -v "$tool" >/dev/null || { echo "Missing $tool (see the top of this script)"; exit 1; }
done
[ -n "$DX" ] || { echo "Missing dalvik-exchange (dx)"; exit 1; }
[ -f "$ANDROID_JAR" ] || { echo "Missing $ANDROID_JAR (set ANDROID_JAR)"; exit 1; }
[ -f "$KOTLIN_STDLIB" ] || { echo "Missing $KOTLIN_STDLIB (set KOTLIN_STDLIB)"; exit 1; }

rm -rf "$BUILD"
mkdir -p "$BUILD/gen" "$BUILD/rclasses" "$BUILD/classes" "$BUILD/assets" dist

echo "1/6 Copying the shared interface into assets"
cp -R ../shared/ui "$BUILD/assets/ui"

echo "2/6 Compiling resources (package $PACKAGE, version $VERSION_NAME / $VERSION_CODE)"
sed "s#<manifest xmlns:android=\"http://schemas.android.com/apk/res/android\">#<manifest xmlns:android=\"http://schemas.android.com/apk/res/android\" package=\"$PACKAGE\">#" \
  "$APP/AndroidManifest.xml" > "$BUILD/AndroidManifest.xml"
aapt2 compile --dir "$APP/res" -o "$BUILD/res.zip"
aapt2 link -I "$ANDROID_JAR" --manifest "$BUILD/AndroidManifest.xml" -A "$BUILD/assets" \
  --min-sdk-version 26 --target-sdk-version 35 --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" \
  --java "$BUILD/gen" -o "$BUILD/unsigned.apk" "$BUILD/res.zip"
javac --release 8 -nowarn -d "$BUILD/rclasses" $(find "$BUILD/gen" -name '*.java')

echo "3/6 Compiling Kotlin"
JAVA_TOOL_OPTIONS= java -cp "$(echo "$KOTLIN_LIB"/*.jar | tr ' ' :)" org.jetbrains.kotlin.cli.jvm.K2JVMCompiler \
  -Xjdk-release=1.8 -no-stdlib -no-reflect -jvm-target 1.8 -Xlambdas=class -Xsam-conversions=class -nowarn \
  -classpath "$ANDROID_JAR:$KOTLIN_STDLIB:$BUILD/rclasses" \
  -d "$BUILD/classes" $(find "$APP/java" -name '*.kt')
cp -R "$BUILD/rclasses/." "$BUILD/classes/"

echo "4/6 Converting to Android bytecode"
cp "$KOTLIN_STDLIB" "$BUILD/stdlib.jar"
zip -q -d "$BUILD/stdlib.jar" 'META-INF/versions/*' >/dev/null || true
"$DX" --dex --min-sdk-version=26 --output="$BUILD/classes.dex" "$BUILD/classes" "$BUILD/stdlib.jar"
(cd "$BUILD" && zip -q unsigned.apk classes.dex)

echo "5/6 Aligning and signing"
zipalign -f -p 4 "$BUILD/unsigned.apk" "$BUILD/aligned.apk"
apksigner sign --ks jarvis-sideload.keystore --ks-pass pass:jarvis-sideload --key-pass pass:jarvis-sideload \
  --ks-key-alias jarvis --out "$OUT" "$BUILD/aligned.apk"
rm -f "$OUT.idsig"

echo "6/6 Verifying"
apksigner verify --min-sdk-version 26 "$OUT"
aapt2 dump badging "$OUT" | sed -n 1,3p
echo "Built $OUT ($(du -k "$OUT" | cut -f1) KB)"
