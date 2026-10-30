# JARVIS AI for Windows

## Install

1. Download `jarvis-ai/windows/dist/JARVIS-AI-Setup-1.0.0.exe` from GitHub (or from the latest **Actions** run, artifact `jarvis-ai-windows`, which also has a portable zip).
2. Run it. Windows **SmartScreen** will probably say "Windows protected your PC", because the installer isn't code-signed (that costs money and needs a verified publisher). Click **More info > Run anyway**.
3. Follow the steps. It installs for your user only, in `%LOCALAPPDATA%\Programs\JARVIS AI`, with no admin rights. It adds **Desktop** and **Start menu** shortcuts.
4. Start **JARVIS AI**. Enter your server address, pairing password and a name for this PC, then click **Connect**.

Requirements: Windows 10 (version 1809 or later) or Windows 11, 64-bit, with the **Microsoft Edge WebView2 Runtime**. WebView2 comes with Windows 11 and up-to-date Windows 10. If it's missing, JARVIS tells you and opens the download page. The .NET runtime is included in the app.

Uninstall from **Settings > Apps** or the Start-menu entry. It asks whether to also delete your local JARVIS data.

**Portable version:** unzip `JARVIS-AI-1.0.0-portable.zip` anywhere and run `JarvisAI.exe`.

## Using it

| | |
|---|---|
| **Ctrl+Alt+J** | Bring JARVIS forward and start listening, from any app |
| **Ctrl+Shift+F12** | **Emergency stop**: denies any open approval, kills commands JARVIS started, stops speech and the current reply |
| **Esc** | Close a panel, then stop speaking, then stop the reply |
| Tray icon | Show, Listen, Emergency stop, Exit |

- **Voice input** uses Windows' built-in speech recognition, offline. It needs a speech language installed (Settings > Time & language > Speech; English usually is) and microphone access for desktop apps (Settings > Privacy & security > Microphone > *Let desktop apps access your microphone*). It's decent but not as accurate as cloud recognisers; typing always works.
- **Voice replies** use the voices installed in Windows. More can be added under Settings > Time & language > Speech > Manage voices.
- **Wake word**: when on, Windows listens offline *only* for your wake phrase, even while JARVIS is minimised. Closing the window then keeps JARVIS in the tray (right-click the tray icon > Exit to quit). See [VOICE.md](VOICE.md).

## PC tools and safety

JARVIS can act on your PC only through a fixed set of tools, set up in **Settings > PC tools**. The AI cannot add to these lists. Only you can, through native dialogs.

| Tool | What it can do | Limits |
|---|---|---|
| `open_app` | Start an approved app | Built-in list (Notepad, Calculator, File Explorer, Paint, Snipping Tool) plus apps you add |
| `open_folder` | Open a folder in Explorer | Approved folders only |
| `open_website` | Open a page in your browser | `http(s)` only |
| `search_files`, `list_folder` | Find and list files | Approved folders only; skips `Library`, `Temp`, `obj`, `bin`, `node_modules`, `.git` |
| `read_file` | Read a text/code file | Approved folders only; text only; 400 KB max |
| `write_file` | Create or overwrite a text/code file | Approved folders only; **the previous version is backed up first** (`%APPDATA%\JarvisAI\Backups`); never `.exe .dll .bat .cmd .ps1 .vbs .js .msi .reg .lnk` and similar |
| `create_note` | Save a Markdown note | `Documents\JARVIS Notes`; never overwrites |
| `run_command` | Run a development command | **Only commands you approved by name** (for example "Run tests" = `npm test` in a folder you chose); 5-minute timeout; output returned to JARVIS |
| `system_info` | Windows version, CPU, memory, disk space, uptime | Read-only |
| `show_notification` | Tray notification | |
| `unity_project_overview` | Unity version, packages, scenes, scripts | Approved folders only |

How it's kept safe:
- **You approve every action** in a native window that shows exactly what will happen: the full command line, the file path, and a preview of new file content. **Deny** is the default button. For read-only actions you can tick "allow without asking until JARVIS restarts".
- **There's no delete tool**, and no tools for installing software or changing system settings. JARVIS can't run arbitrary commands or anything the AI writes: `run_command` takes only the *name* of a command you approved, and even adding a command needs your confirmation in a native dialog.
- **Approved folders**: paths are checked after resolving `..`, symbolic links and junctions, so nothing outside the folders is reachable. Whole drives can't be approved.
- **Emergency stop** (Ctrl+Shift+F12, tray menu, or the button in Settings) works at any time.
- **Action log**: every request, approval, denial and result is recorded in `%APPDATA%\JarvisAI\actions.log`. You can view it in Settings > PC tools.
- Windows security is never bypassed. JARVIS runs as your normal user without admin rights, so anything needing admin rights simply fails.

**What JARVIS can't do on Windows, and the alternative:** it can't click around inside other programs or read your screen. That can't be done reliably or safely with approvals, so it explains the steps instead. It also can't control Unity's Editor directly; it reads and writes your project's script files, and you press Play.

## Build it yourself

Needs the [.NET 10 SDK](https://dotnet.microsoft.com/download) and, for the installer, [NSIS 3](https://nsis.sourceforge.io).

```powershell
cd Games\jarvis-ai\windows
powershell -ExecutionPolicy Bypass -File build.ps1
```
This runs the unit tests, then publishes `build\publish\JarvisAI.exe` (self-contained), and creates `dist\JARVIS-AI-Setup-<version>.exe` and the portable zip. To work on the app in **Visual Studio 2022/2026**, open `windows\JarvisAI.sln` and run **JarvisAI.Desktop**. Edits to the interface go in `jarvis-ai\shared\ui` and are copied in at build time.

The installer in `dist/` was cross-compiled on Linux with the same commands (`build.sh`). It was started under Wine and reached the WebView2 check correctly. It has **not been run on a real Windows PC**, so please report anything odd.

## Files on your PC

| Path | Contents |
|---|---|
| `%LOCALAPPDATA%\Programs\JARVIS AI` | The app |
| `%APPDATA%\JarvisAI\secure\` | Device token, encrypted with Windows DPAPI (only your Windows account can read it) |
| `%APPDATA%\JarvisAI\tools.json` | Approved folders, apps and commands |
| `%APPDATA%\JarvisAI\actions.log` | Action log |
| `%APPDATA%\JarvisAI\Backups\` | Backups made before JARVIS overwrote a file |
| `%LOCALAPPDATA%\JarvisAI\WebView2\` | Interface cache and local preferences |
| `Documents\JARVIS Notes\` | Notes JARVIS created |
