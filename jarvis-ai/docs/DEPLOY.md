# Deploying the JARVIS server

The server is what your phone and PC talk to. It holds your Claude API key, your conversations and your memories. It must be reachable over **HTTPS** from anywhere, which is why it runs on a cloud host and not on your PC (your phone needs it when you're away from home).

Pick one route:

| Route | Cost | Effort | Notes |
|---|---|---|---|
| [Fly.io](#option-a-flyio-recommended) | About $2-5/month | Easy (15 min) | Free `https://….fly.dev` address, data kept on a small disk |
| [Render](#option-b-render) | About $7.25/month | Easy, all in the browser | Needs the paid Starter plan for a disk |
| [Your own VPS](#option-c-any-linux-vps-with-docker) | Varies (some free tiers) | Medium | Needs a domain name pointing at the server |

First, have these ready:

1. **A Claude API key.** Sign in at [platform.claude.com](https://platform.claude.com), go to Settings > API keys, and create a key. Also go to **Settings > Limits** and set a **monthly spend limit** (for example $10).
2. **A pairing password.** Make up a long random one, 16+ characters. Every device uses it once to pair. In PowerShell: `-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 24 | % {[char]$_})`

Keep both secret. They only ever go into the server's settings, never into the apps or the code.

---

## Option A: Fly.io (recommended)

1. Create an account at [fly.io](https://fly.io) (a payment card is needed).
2. Install `flyctl`. In PowerShell: `iwr https://fly.io/install.ps1 -useb | iex`, then reopen PowerShell. Run `fly auth login`.
3. Get this project onto your PC (`git clone https://github.com/gmaingtech1-sudo/Games`, or *Code > Download ZIP* on GitHub) and open PowerShell in the `jarvis-ai` folder.
4. Create the app (pick a unique name; it becomes `https://NAME.fly.dev`):
   ```powershell
   fly launch --no-deploy --copy-config --name jarvis-yourname
   ```
   If it asks to change settings, answer **No**. If it asks about a database, answer **No**.
5. Create the disk for the database (in the same region as the app; `lhr` is London, `fly platform regions` lists others):
   ```powershell
   fly volumes create jarvis_data --size 1 --region lhr
   ```
6. Store your secrets on Fly (they are encrypted there and never appear in files):
   ```powershell
   fly secrets set JARVIS_PASSWORD="your-long-password" ANTHROPIC_API_KEY="sk-ant-..."
   ```
7. Deploy:
   ```powershell
   fly deploy
   ```
8. Check it works: open `https://jarvis-yourname.fly.dev/api/health` in a browser. You should see `{"ok":true,...}`. You can also open `https://jarvis-yourname.fly.dev/` to use JARVIS in the browser.

Your server address for the apps is `https://jarvis-yourname.fly.dev`.

Notes:
- The machine sleeps when unused (cheaper) and wakes on the first request, which takes a few extra seconds.
- Change settings with `fly secrets set NAME=value` (for example `DAILY_BUDGET_USD=5`); the server restarts automatically. View logs with `fly logs`.
- Update after pulling new code: `fly deploy`.

## Option B: Render

1. Create an account at [render.com](https://render.com) and connect your GitHub account.
2. **New > Web Service**, then choose this repository.
3. Settings:
   - **Runtime**: Docker
   - **Dockerfile path**: `jarvis-ai/backend/Dockerfile`
   - **Docker build context**: `jarvis-ai`
   - **Instance type**: Starter
4. **Advanced > Add disk**: mount path `/data`, size 1 GB. Without a disk, your data is wiped on every deploy.
5. **Environment**: add `JARVIS_PASSWORD`, `ANTHROPIC_API_KEY`, `TRUST_PROXY=true` and `DAILY_BUDGET_USD=2`.
6. **Health check path**: `/api/health`. Then create the service.

Your address is the `https://….onrender.com` URL Render shows. (There is also a blueprint in [`deploy/render.yaml`](../deploy/render.yaml).)

## Option C: Any Linux VPS with Docker

You need a server with Docker and a domain (or subdomain) pointing at its IP address.

```bash
git clone https://github.com/gmaingtech1-sudo/Games && cd Games/jarvis-ai
cp .env.example deploy/.env && chmod 600 deploy/.env && nano deploy/.env   # set JARVIS_PASSWORD and ANTHROPIC_API_KEY
nano deploy/Caddyfile                                                       # replace jarvis.example.com with your domain
docker compose -f deploy/docker-compose.yml up -d --build
```

Caddy gets and renews a free HTTPS certificate automatically. Open ports 80 and 443 in the firewall, and only those. Update with `git pull && docker compose -f deploy/docker-compose.yml up -d --build`.

---

## Run it on your PC first (optional, for testing)

1. Install [Node.js 22 LTS or newer](https://nodejs.org).
2. In `jarvis-ai\backend`: `copy ..\.env.example .env`, then edit `.env` with your password and key.
3. `npm install`, then `npm start`.
4. Open `http://localhost:8787`. JARVIS runs in the browser. The Windows app can connect to `http://localhost:8787` too.
5. A phone on the **same Wi-Fi** can connect to `http://YOUR-PC-IP:8787` (find the IP with `ipconfig`; Windows Firewall will ask to allow Node.js on private networks). Plain `http://` is accepted only for addresses on your own network. Away from home, you need the deployed `https://` server.

To try everything with no API key and no cost, set `AI_PROVIDER=mock` (canned replies, no AI).

## Configuration reference

All settings are environment variables. [`.env.example`](../.env.example) lists and explains every one. The most useful:

| Variable | Default | Meaning |
|---|---|---|
| `JARVIS_PASSWORD` | (required) | Pairing password, 12+ characters |
| `ANTHROPIC_API_KEY` | (required for Claude) | Your key; stays on the server |
| `AI_MODELS` / `DEFAULT_MODEL` | Opus 5.5, Sonnet 5.5, Haiku 5.5 | Models offered in Settings |
| `AI_EFFORT` | `medium` | How hard Claude thinks: `low` (cheaper, faster) to `max` |
| `DAILY_BUDGET_USD` | `0` (off; the template sets 2) | Stop answering once today's estimated cost reaches this |
| `WEB_SEARCH_ENABLED` | `true` | Allow web search (also switchable in the app) |
| `HISTORY_RETENTION_DAYS` | `0` (keep) | Auto-delete conversations older than this |
| `OPENAI_BASE_URL` / `OPENAI_API_KEY` | | Use any OpenAI-compatible provider via `openai:` models |
| `TRUST_PROXY` | `false` | Set `true` behind Fly/Render/Caddy |

### Switching AI provider or model later

- Different Claude model: change `AI_MODELS`/`DEFAULT_MODEL`, or just pick one in the app's Settings.
- Another provider (OpenAI, OpenRouter, Groq, a local Ollama…): set `OPENAI_BASE_URL` and `OPENAI_API_KEY`, then add models like `openai:model-name|Label` to `AI_MODELS`. Web search is available with Claude models only.
- A provider with a different API: add a module next to [`backend/src/providers/anthropic.js`](../backend/src/providers/anthropic.js) with the same `stream()` function and register it in `providers/index.js`.

## Security checklist

- Use HTTPS (all three options above do).
- Use a long, random `JARVIS_PASSWORD`. Pairing is rate-limited (8 tries per 15 minutes per IP).
- Lost a phone? In Settings > Connection, **Revoke** it from another device. Device tokens are stored only as hashes.
- Changing `JARVIS_PASSWORD` doesn't sign out paired devices. Revoke them if needed.
- If you suspect your Claude key leaked, revoke it in the Anthropic Console and set a new one with `fly secrets set`.

## Backups

Everything is in one SQLite file, `/data/jarvis.db`. You can:
- Use **Settings > Memory & privacy > Export my data** in the app (a JSON file).
- On Fly.io, copy the database: `fly ssh sftp get /data/jarvis.db`.
- On a VPS: `docker compose -f deploy/docker-compose.yml cp jarvis:/data/jarvis.db .`
