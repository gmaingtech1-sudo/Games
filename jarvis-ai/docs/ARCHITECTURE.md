# Architecture

## Components

| Component | Technology | Responsibility |
|---|---|---|
| **Server** (`backend/`) | Node.js 22+, Express 5, built-in `node:sqlite`, official Anthropic SDK | The only part that talks to the AI. Holds the API key. Pairing and device tokens, chat streaming, the tool loop, memory, history, settings, usage and budget, privacy export/erase. Also serves the web UI for browsers. |
| **Shared UI** (`shared/ui/`) | Plain HTML/CSS/JavaScript modules, no build step | All screens: visualiser, chat, settings, memory, history, pairing, offline demo. Runs in a browser, in Android's WebView and in Windows' WebView2. |
| **Android app** (`android/`) | Kotlin, Android platform APIs only (no AndroidX), Gradle | Hosts the UI; native speech in and out, Keystore storage, microphone permission, file picker, splash, icon, back button. |
| **Windows app** (`windows/`) | C# .NET 10, WinForms + WebView2, System.Speech | Hosts the UI; native speech and wake word, DPAPI storage, PC tools with approval dialogs, action log, tray, hotkeys, emergency stop. Tool logic is in the cross-platform, unit-tested `JarvisAI.Core`. |

Why this shape:
- **Security:** the AI key stays on the server.
- **Reachability:** the phone works away from home, because the server is in the cloud rather than on the PC.
- **No duplication:** one UI for both platforms, with only the genuinely native parts written twice (speech, storage, permissions).
- **Cost:** no paid services beyond the AI and a small host.

## How a chat turn flows

```
App (UI)                               Server                                   Claude API
   │ POST /api/chat  (Bearer token)       │                                          │
   │ {conversationId, message,            │                                          │
   │  attachments, clientTools}           │ store user message                       │
   │ ────────────────────────────────────►│ build system prompt (style, memories,     │
   │                                      │   custom instructions, date)              │
   │   SSE: conversation, status          │ stream request ─────────────────────────►│
   │◄──── delta, delta, delta ────────────│◄──────────────── text deltas ────────────│
   │   (speaks sentences as they finish)  │                                          │
   │                                      │ stop_reason = tool_use?                   │
   │                                      │  • save_memory/forget_memory → run on     │
   │   SSE: memory {saved}                │    the server, loop back to Claude        │
   │                                      │  • PC tool (Windows) → hand to the app:   │
   │   SSE: tool_request {calls}, done    │    remember as "pending", end response    │
   │ native approval dialog → run tool    │                                          │
   │ POST /api/chat {toolResults} ───────►│ store results, continue the loop ────────►│
   │◄──── delta … done ───────────────────│                                          │
```

- **Stop/interrupt**: the app aborts the HTTP request, and the server aborts the request to Claude, so you stop paying for output you didn't want. Text already received is kept, marked *interrupted*.
- **Conversation storage**: Claude's raw content blocks are stored and sent back unchanged, which keeps thinking blocks and prompt caching valid. The apps get a separate display version.
- **System prompt**: built deterministically and marked for prompt caching. Later turns read the cached prefix at about a tenth of the price.
- **Refusals**: Claude Opus/Sonnet 5.5 requests opt into server-side refusal fallbacks. If a request is still declined, the app shows a clear "declined" notice.
- **Providers** (`backend/src/providers/`): `anthropic` (default; official SDK, web search, effort, caching, fallbacks); `openai` (any OpenAI-compatible Chat Completions API, converted to and from the same block format); `mock` (offline demo and tests). Adding one means writing a `stream()` function.

## Native bridge

The UI calls native features through one JSON message protocol (`shared/ui/js/platform.js`):

```
UI → host   {"id": 7, "method": "tts.speak", "params": {"text": "Hello.", "id": "u3", "rate": 1}}
host → UI   {"id": 7, "result": true}
host → UI   {"event": "tts.done", "data": {"id": "u3"}}
```

| Methods | Android | Windows |
|---|---|---|
| `host.info` (capabilities) | ✓ | ✓ |
| `storage.get/set/remove` (secure) | Keystore AES-GCM | DPAPI |
| `stt.start/stop/cancel` → `stt.partial/final/level/error/end` | SpeechRecognizer | System.Speech dictation |
| `tts.voices/speak/stop` → `tts.start/done` | TextToSpeech | SpeechSynthesizer |
| `wake.start/stop` → `wake.detected` | (done in JS: foreground loop) | System.Speech keyword grammar |
| `tools.list/execute/cancel/emergencyStop`, `tools.getConfig/add…/remove…/log` | – | ✓ |
| `file.pick`, `file.save` | Storage Access Framework | Open/Save dialogs |
| `app.openExternal`, `app.permission`, `app.requestPermission`, `app.openSystemSettings` | ✓ | ✓ |
| Events: `app.pause/resume` | ✓ | – |
| Events: `hotkey.listen`, `emergency.stop` | – | ✓ |

Only the app's own page can use the bridge:
- **Android:** the page is served from the APK at `https://appassets.androidplatform.net/ui/`. The bridge checks the WebView's current host, and navigation elsewhere opens in the browser.
- **Windows:** the page is served from `https://jarvis.app.local/` (a virtual host mapped to the install folder), and messages from any other origin are ignored.

In both apps, the page has a strict Content Security Policy (no inline scripts), and AI output is HTML-escaped before Markdown formatting.

## Security model (summary)

| Threat | Defence |
|---|---|
| AI key theft from the apps | The key is never in the apps; it's a server secret only |
| Someone else using your server | Pairing password (rate-limited) → per-device random token, stored hashed, revocable; CORS restricted to the apps' origins |
| Network snooping | HTTPS (Fly/Render/Caddy); the app refuses plain `http://` except for private LAN addresses |
| Stolen phone | Revoke the device from Settings; the token on the phone is Keystore-encrypted |
| AI tries something harmful on the PC | Fixed tool list; no delete, install or settings tools; approved folders (`..`, symlink and junction checks); approved commands by name only; native approval with default Deny; backups before writes; action log; emergency stop |
| Malicious content in AI replies | HTML escaped; only `http(s)` links; CSP blocks inline scripts; the bridge is limited to the app origin |
| Runaway cost | Provider spend limit + `DAILY_BUDGET_USD` + visible usage estimate |

## Database schema (SQLite)

`devices` (id, name, platform, token_hash, created_at, last_seen_at) · `conversations` (id, title, temporary, pending_json, created_at, updated_at) · `messages` (conversation_id, role, content_json, display_json, model, created_at) · `memories` (id, kind, title, content, source, created_at, updated_at) · `settings` (key, value_json) · `usage` (day, input_tokens, output_tokens, web_searches, cost_usd, requests). Created automatically on first start (`backend/src/db.js`).

SQLite on a persistent disk is plenty for one person. PostgreSQL support isn't implemented. It would mean a second implementation of `db.js` with the same functions, which is only worth doing if you want a host without disks (for example Cloud Run).
