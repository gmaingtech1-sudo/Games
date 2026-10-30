# Server API

Base URL: your server, for example `https://jarvis-yourname.fly.dev`. All bodies are JSON. Errors look like `{"error": {"code": "...", "message": "..."}}`.

Every route except `GET /api/health` and `POST /api/auth/pair` needs `Authorization: Bearer <device token>`.

## Auth and devices

| Method & path | Body | Response |
|---|---|---|
| `GET /api/health` | | `{ok, name, version}` |
| `POST /api/auth/pair` | `{password, deviceName, platform: "android"\|"windows"\|"web"}` | `201 {token, device}` · `401 wrong_password` · `429 too_many_attempts` (8 per 15 min per IP) |
| `GET /api/auth/me` | | `{device}` |
| `POST /api/auth/unpair` | | Revokes the calling device |
| `GET /api/devices` | | `{devices, currentId}` |
| `DELETE /api/devices/:id` | | Revoke a device |

## Configuration and settings

| | | |
|---|---|---|
| `GET /api/config` | | `{version, models: [{id, label, provider, webSearch}], defaultModel, styles: [{id, label, description}], memoryKinds, features: {webSearch, dailyBudgetUsd}}` |
| `GET /api/settings` | | `{settings}` |
| `PUT /api/settings` | Any of `assistantName, userName, style, model, customInstructions` (text) and `memoryEnabled, webSearchEnabled, historyEnabled` (true/false) | `{settings}` |
| `GET /api/usage` | | `{today: {input_tokens, output_tokens, web_searches, cost_usd, requests}, month: {cost_usd, requests}, dailyBudgetUsd}` |

## Conversations

| | | |
|---|---|---|
| `GET /api/conversations` | | `{conversations: [{id, title, created_at, updated_at, message_count}]}` (temporary ones excluded) |
| `GET /api/conversations/:id` | | `{conversation, messages: [{id, role, text, attachments?, sources?, interrupted?, model, created_at}]}` |
| `PATCH /api/conversations/:id` | `{title}` | Rename |
| `DELETE /api/conversations/:id` | | Delete one |
| `DELETE /api/conversations` | | Delete all |

## Memories

| | | |
|---|---|---|
| `GET /api/memories` | | `{memories: [{id, kind, title, content, source: "user"\|"assistant", created_at, updated_at}]}` |
| `POST /api/memories` | `{kind: fact\|preference\|project\|instruction, title?, content}` | `201 {memory}` |
| `PUT /api/memories/:id` | Any of `kind, title, content` | `{memory}` |
| `DELETE /api/memories/:id` / `DELETE /api/memories` | | Delete one / all |

## Privacy

| | | |
|---|---|---|
| `GET /api/export` | | Everything as a JSON download |
| `POST /api/delete-all-data` | `{confirm: "DELETE", keepDevices?: true}` | Erase conversations, memories, settings and usage |

## Chat: `POST /api/chat` (Server-Sent Events)

Request:
```json
{
  "conversationId": "conv_… (omit to start a new one)",
  "message": "text",
  "attachments": [{"name": "Player.cs", "text": "…"}],
  "toolResults": [{"id": "toolu_…", "content": "…", "isError": false}],
  "clientTools": [{"name": "open_app", "description": "…", "input_schema": {"type": "object", …}}],
  "model": "anthropic:claude-opus-5-5 (optional)"
}
```
Send either `message`/`attachments`, or `toolResults` to answer a `tool_request`.

The response is `text/event-stream`. Events (each `event: name` + `data: JSON`):

| Event | Data |
|---|---|
| `conversation` | `{id, title, temporary}` |
| `status` | `{state: "thinking" \| "searching"}` |
| `delta` | `{text}`: append to the reply |
| `sources` | `{items: [{url, title, page_age, cited}]}` |
| `memory` | `{action: "saved" \| "deleted", memory}` |
| `notice` | `{code: "refused" \| "truncated" \| "tool_limit", message}` |
| `tool_request` | `{calls: [{id, name, input}]}`: run them, then POST `toolResults` |
| `error` | `{code, message, retryable}`: codes include `provider_auth`, `rate_limited`, `provider_unavailable`, `provider_unreachable`, `budget_exceeded`, `bad_request`, `not_found` |
| `done` | `{stopReason, model, usage: {inputTokens, outputTokens, webSearches, costUsd}}` |

Closing the connection stops the reply (and the request to the AI).

Example with curl:
```bash
TOKEN=$(curl -s -X POST https://SERVER/api/auth/pair -H 'content-type: application/json' \
  -d '{"password":"…","deviceName":"curl"}' | jq -r .token)
curl -N -X POST https://SERVER/api/chat -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"message":"Hello JARVIS"}'
```
