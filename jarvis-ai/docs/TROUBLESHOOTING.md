# Troubleshooting

## Connecting

| Symptom | Fix |
|---|---|
| "Can't reach the JARVIS server" | Open `https://YOUR-SERVER/api/health` in the phone's browser. If that fails, the server is down or the address is wrong: check `fly status` / `fly logs` (or the Render dashboard). On Fly, the first request after a quiet period takes a few seconds while the machine wakes. |
| "Wrong password" | Use exactly the `JARVIS_PASSWORD` value from the server (`fly secrets list` shows that it's set, not the value; set it again if unsure). |
| "Too many pairing attempts" | Wait 15 minutes. |
| "Use https:// for a server on the internet" | Internet servers must use HTTPS. Plain `http://` is only allowed for your own network (`192.168.x.x`, `10.x.x.x`, `localhost`). |
| "This device is not paired or was revoked" | Pair again (it opens automatically). |
| Works at home, not outside | You're using a local address. Deploy the server ([DEPLOY.md](DEPLOY.md)) and connect to its `https://` address. |
| Server won't start: "configuration error" | It names the missing variable: `JARVIS_PASSWORD` (12+ characters) or `ANTHROPIC_API_KEY`. |

## AI errors (shown in the chat)

| Message | Fix |
|---|---|
| "The AI provider rejected the server's API key" | Wrong, revoked or out-of-credit key. Create a new key and `fly secrets set ANTHROPIC_API_KEY=…`; check billing in the Anthropic Console. |
| "rate limiting requests" | Wait a minute. New API accounts have low limits that rise with use. |
| "temporarily overloaded or unavailable" | Tap **Retry** after a moment. |
| "That AI model is not available to this API key" | Pick another model in Settings, or fix `AI_MODELS`. |
| "Today's AI budget … has been reached" | Raise `DAILY_BUDGET_USD`, or wait until midnight UTC. |
| "The AI declined to answer this request" | A safety system blocked it. Rephrase. Normal requests (including security questions about your own code) usually work. |
| "The reply hit the length limit" | Say "continue". Raise `MAX_OUTPUT_TOKENS` if it happens often. |

## Voice

| Symptom | Fix |
|---|---|
| Android: mic does nothing / "permission is off" | Phone Settings > Apps > JARVIS AI > Permissions > Microphone > Allow. |
| Android: "No speech recognition service" | Install or enable the **Google** app (or another recogniser) and set it as the default voice input. |
| Android: network error while speaking | Recognition needs internet unless offline speech is downloaded (Google app > Settings > Voice > Offline speech recognition). |
| Android: no voice replies | Check phone Settings > Text-to-speech output; install voice data; turn on **Voice replies** in JARVIS. |
| Windows: mic button missing | No Windows speech recogniser is installed. Add a speech language in Settings > Time & language > Speech, then restart JARVIS. |
| Windows: "Didn't catch that" every time | Settings > Privacy & security > Microphone: turn on *Let desktop apps access your microphone*; choose the right default mic in Sound settings; speak right after the start tone. |
| Windows: recognition is poor | Windows dictation is offline and basic. Run *Speech recognition > Train your PC* in Control Panel, use a headset, or type. |
| Wake word never triggers | Use a distinctive word ("Jarvis" or "Computer"). On Android it only works while JARVIS is on screen. On Windows check the mic as above. |

## Windows app

| Symptom | Fix |
|---|---|
| "Windows protected your PC" | The installer isn't code-signed. Click **More info > Run anyway**. |
| "WebView2 Runtime missing" | Install the Evergreen WebView2 Runtime from Microsoft (the app opens the page), then restart JARVIS. |
| Blank window | Delete `%LOCALAPPDATA%\JarvisAI\WebView2` and start again. |
| Hotkey doesn't work | Another app uses Ctrl+Shift+F12 or Ctrl+Alt+J (noted in `actions.log`). Use the tray menu instead. |
| A tool says "outside your approved folders" | Add the folder in Settings > PC tools. |
| Crashed | Details are in `%APPDATA%\JarvisAI\crash.log`. |

## Android app

| Symptom | Fix |
|---|---|
| "App not installed" | An older JARVIS signed with a different key is installed. Uninstall it first. |
| Blank or white screen | Update **Android System WebView** and **Chrome** from the Play Store. |
| Play Protect warning | Expected for apps outside the Play Store: **More details > Install anyway**. |

## Building

| Symptom | Fix |
|---|---|
| Android Studio: "SDK location not found" | Open the project once in Android Studio (it writes `local.properties`), or create `android/local.properties` with `sdk.dir=C\:\\Users\\YOU\\AppData\\Local\\Android\\Sdk`. |
| Android Studio: "Android Gradle Plugin requires Java 17" | Settings > Build Tools > Gradle > Gradle JDK: choose the bundled JetBrains Runtime (17+). |
| `npm start` fails with `node:sqlite` errors | Use Node.js 22.13 or newer (`node -v`). |
| `dotnet` can't find `net10.0-windows` | Install the .NET 10 SDK (not just the runtime). |
