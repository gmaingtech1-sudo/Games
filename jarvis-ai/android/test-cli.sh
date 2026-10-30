#!/usr/bin/env bash
# Runs the plain-JVM Android unit tests (TextFilesTest) without Gradle,
# against the output of build-cli.sh (run that first). The Robolectric test
# (MainActivityTest) needs androidx.test from Google's Maven repository, so
# run the full suite with Gradle instead:  ./gradlew testDebugUnitTest
#
# Needs TEST_LIB: junit-4.13.2, hamcrest-core-1.3 and json-20250517 jars (Maven Central).
set -euo pipefail
cd "$(dirname "$0")"

ANDROID_JAR="${ANDROID_JAR:-/opt/sdkwork/android-all-13.jar}"
KOTLIN_LIB="${KOTLIN_LIB:-/opt/kotlinc/lib}"
KOTLIN_STDLIB="${KOTLIN_STDLIB:-/opt/kotlinc/stdlib/lib/kotlin-stdlib-2.2.21.jar}"
TEST_LIB="${TEST_LIB:-/opt/robo/lib}"
BUILD=build/cli
TEST=build/cli-test

[ -d "$BUILD/classes" ] || { echo "Run ./build-cli.sh first"; exit 1; }
rm -rf "$TEST" && mkdir -p "$TEST/classes"
LIBS="$TEST_LIB/junit-4.13.2.jar:$TEST_LIB/hamcrest-core-1.3.jar:$TEST_LIB/json-20250517.jar"

echo "Compiling tests"
JAVA_TOOL_OPTIONS= java -cp "$(echo "$KOTLIN_LIB"/*.jar | tr ' ' :)" org.jetbrains.kotlin.cli.jvm.K2JVMCompiler \
  -no-stdlib -no-reflect -jvm-target 1.8 -nowarn \
  -classpath "$ANDROID_JAR:$KOTLIN_STDLIB:$BUILD/classes:$LIBS" \
  -d "$TEST/classes" app/src/test/java/app/jarvisai/assistant/TextFilesTest.kt

echo "Running tests"
java -cp "$TEST/classes:$BUILD/classes:$KOTLIN_STDLIB:$LIBS" org.junit.runner.JUnitCore app.jarvisai.assistant.TextFilesTest
