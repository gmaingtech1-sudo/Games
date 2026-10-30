# Your data: where it lives, how it's protected, how to delete it

JARVIS only stores what you see in the app. There's no analytics, no advertising and no hidden collection.

## On your server

One SQLite database file (`/data/jarvis.db` on Fly/Render/Docker, `backend/data/jarvis.db` locally) holds:

| Data | Details | Delete it |
|---|---|---|
| Conversations | The messages, plus the AI's raw reply data, needed to continue a conversation | History panel: delete one or **Clear all history**; or set `HISTORY_RETENTION_DAYS` |
| Memories | Facts, preferences, projects and instructions you or JARVIS saved (JARVIS shows every save) | Memory panel: edit, delete, or **Delete all memories** |
| Settings | Assistant name, your name, style, model, custom instructions, switches | Reset by Delete all data |
| Paired devices | Name, type, last-used time, and a **SHA-256 hash** of each device's token (never the token itself) | Settings > Connection > **Revoke** / **Unpair** |
| Usage | Daily token counts and cost estimates, for the budget | Delete all data |

**Settings > Memory & privacy > Export my data** downloads everything as JSON. **Delete all data** (type DELETE to confirm) erases conversations, memories, settings and usage; your devices stay paired.

When **Save conversation history** is off, new conversations are "temporary": they're hidden from History and deleted from the server one hour after the last message. They're still stored while they're active, because the AI needs the context.

### Protection

- HTTPS between the apps and the server. Each device has its own random token, kept in the phone's Keystore or with Windows DPAPI.
- Pairing needs your password and is rate-limited. Tokens can be revoked.
- The Claude API key exists only as a server secret. It's never sent to the apps and never shown in Settings.
- Anyone with access to your hosting account can read the database. Use a strong password and two-factor login for Fly/Render/your VPS.

## At the AI provider

To answer, JARVIS sends the conversation (and any attached files, memories and custom instructions) to Anthropic's API. API data isn't used to train models by default; check Anthropic's current privacy policy and data-retention terms. If you use web search, your search queries go through Anthropic to a search provider. With the offline demo or `AI_PROVIDER=mock`, nothing is sent anywhere.

## On your devices

- **Android**: the device token is AES-GCM encrypted with a key held in the Android Keystore. App backups are disabled. Voice preferences are kept in the app's private storage. Uninstalling the app removes everything.
- **Windows**: see the file table in [WINDOWS.md](WINDOWS.md#files-on-your-pc). The uninstaller offers to delete them all.
- **Speech**: on Windows, recognition is done offline by Windows. On Android, by your phone's recogniser (often Google, which may process audio online unless you installed offline speech). JARVIS itself only sends the recognised text.
