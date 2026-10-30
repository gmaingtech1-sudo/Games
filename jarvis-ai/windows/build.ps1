# Builds JARVIS AI for Windows on Windows.
#   Requires: .NET 10 SDK (https://dotnet.microsoft.com/download) and, for the installer,
#   NSIS 3 (https://nsis.sourceforge.io) - makensis.exe on PATH or in its default folder.
# Run from this folder:   powershell -ExecutionPolicy Bypass -File build.ps1
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$version = ([xml](Get-Content src/JarvisAI.Desktop/JarvisAI.Desktop.csproj)).Project.PropertyGroup.Version | Where-Object { $_ } | Select-Object -First 1

Write-Host "1/4 Running unit tests"
dotnet test tests/JarvisAI.Core.Tests --nologo
if ($LASTEXITCODE -ne 0) { throw "Tests failed" }

Write-Host "2/4 Publishing JarvisAI.exe"
if (Test-Path build/publish) { Remove-Item -Recurse -Force build/publish }
dotnet publish src/JarvisAI.Desktop -c Release -r win-x64 --self-contained true -p:DebugType=none -o build/publish --nologo
if ($LASTEXITCODE -ne 0) { throw "Publish failed" }

New-Item -ItemType Directory -Force dist | Out-Null
Write-Host "3/4 Building the installer"
$makensis = (Get-Command makensis -ErrorAction SilentlyContinue).Source
if (-not $makensis) { $makensis = "${env:ProgramFiles(x86)}\NSIS\makensis.exe" }
if (Test-Path $makensis) {
  Push-Location installer
  & $makensis -V2 "-DVERSION=$version" "-DSRC=..\build\publish" "-DOUT=..\dist\JARVIS-AI-Setup-$version.exe" jarvis.nsi
  Pop-Location
} else {
  Write-Warning "NSIS not found: skipping the installer. Run build\publish\JarvisAI.exe directly, or install NSIS."
}

Write-Host "4/4 Building the portable zip"
Compress-Archive -Path build/publish/* -DestinationPath "dist/JARVIS-AI-$version-portable.zip" -Force
Get-ChildItem dist
