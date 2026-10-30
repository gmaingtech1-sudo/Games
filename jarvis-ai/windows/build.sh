#!/usr/bin/env bash
# Builds the Windows app on Linux (it cross-compiles; it does not run here):
#   dist/JARVIS-AI-Setup-<version>.exe   installer (per-user, no admin)
#   dist/JARVIS-AI-<version>-portable.zip  unzip and run JarvisAI.exe
# Needs the .NET 10 SDK (with Windows Desktop support), NSIS (makensis) and zip.
# On Windows, use build.ps1 instead.
set -euo pipefail
cd "$(dirname "$0")"
VERSION=$(sed -n 's#.*<Version>\(.*\)</Version>.*#\1#p' src/JarvisAI.Desktop/JarvisAI.Desktop.csproj)

echo "1/4 Running unit tests"
dotnet test tests/JarvisAI.Core.Tests --nologo -v quiet

echo "2/4 Publishing JarvisAI.exe (self-contained, win-x64)"
rm -rf build/publish
dotnet publish src/JarvisAI.Desktop -c Release -r win-x64 --self-contained true -p:DebugType=none -o build/publish --nologo -v quiet

echo "3/4 Building the installer"
mkdir -p dist
(cd installer && makensis -V2 -DVERSION="$VERSION" -DSRC=../build/publish -DOUT="../dist/JARVIS-AI-Setup-$VERSION.exe" jarvis.nsi)

echo "4/4 Building the portable zip"
rm -f "dist/JARVIS-AI-$VERSION-portable.zip"
(cd build/publish && zip -qr "../../dist/JARVIS-AI-$VERSION-portable.zip" .)
ls -la dist
