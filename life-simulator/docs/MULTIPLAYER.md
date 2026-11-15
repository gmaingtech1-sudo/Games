# Multiplayer

Life Simulator has online multiplayer built on Godot's high-level multiplayer API and **ENet** (UDP). Single player never touches the network and works fully offline.

## Ways to play

| Mode | How | Notes |
| --- | --- | --- |
| **Host Game** | Main menu → Multiplayer → Host Game | Your phone is the server and you play at the same time. Friends on the same Wi-Fi join with the local IP address shown on screen. |
| **Join Game** | Main menu → Multiplayer → enter the address → Join Game | Joins a host or a dedicated server. The default port is **24555** (UDP). |
| **Dedicated server** | `godot --headless --path . -- --server --port 24555` | A headless server with no player and no rendering. This is the best option for internet play. |

Online play uses a separate **online profile** for each player name, stored on the server. Your single-player save slots are never uploaded or changed.

## Architecture

```
 Client (phone)                          Server (host or dedicated)
 ─────────────                           ──────────────────────────
 Player presses "Buy"                     
   GameManager.act("buy_item", {...}) ──► MultiplayerManager._srv_action
                                            · checks the sender is signed in
                                            · action whitelist (ActionRouter.ACTIONS)
                                            · rate limit (12 actions/s)
                                            · ActionRouter.apply(SERVER copy of state)
                                              (price from the server's own data,
                                               funds, inventory space, shop...)
   GameManager.apply_server_result  ◄──── result + snapshot of server-owned keys
   (local money/inventory replaced
    by the server's values)

 Movement (10 Hz, unreliable)       ───► relayed to the other players
 Chat (reliable)                    ───► length limit, rate limit, sanitised, broadcast
                                    ◄─── world time and weather every 5 s
                                    ◄─── daily business/rent updates
```

* **Single source of rules.** Single player and the server run exactly the same rule code (`scripts/core/action_router.gd` and the `*_rules.gd` modules). Nothing is duplicated, so nothing can drift apart.
* **Server-owned data** (`PlayerState.SERVER_KEYS`): cash, bank, transactions, inventory, equipped clothes, job and career history, qualifications, courses, properties, vehicles, businesses, challenges and claimed rewards. The client's copy is overwritten by every server snapshot, so editing memory or the client achieves nothing.
* **Client-simulated** (not valuable): needs, position and animation, and mission objective progress. Needs are sent with each request and clamped to 0–100.
* **Specific protections**
  * Purchases use the server's price table and check funds, shop and space.
  * Mission rewards come from server data and can be claimed only once each (daily ones once per day, from the same deterministic daily list).
  * Work shifts need a job, the right hours, one shift per day, and at least 15 real seconds between shifts.
  * Vehicle reports may only lower fuel and raise damage.
  * Race results faster than physically possible are rejected.
  * Positions outside the world bounds are dropped.
* **Identity.** The first time a name joins, the server creates a profile and a random token. The client stores the token in `user://online_tokens.cfg`. If someone else tries the same name without the token, they're refused.
* **Persistence.** Profiles are saved to `user://server_profiles/` every 30 seconds, whenever someone disconnects, and at each new day.

## Running a dedicated server

### From the project (any OS with Godot 4.4.1)

```sh
godot --headless --path /path/to/life-simulator -- --server --port 24555
```

### As a standalone Linux binary

Export the **Linux Server** preset (Project → Export, or from the command line):

```sh
godot --headless --path . --export-release "Linux Server" build/server/life-simulator-server.x86_64
./build/server/life-simulator-server.x86_64 --headless -- --server --port 24555
```

Keep `life-simulator-server.pck` next to the binary. Options:

| Flag | Meaning |
| --- | --- |
| `--server` | Run as a dedicated server |
| `--port N` | UDP port (default 24555) |
| `--quit-after S` | Shut down after S seconds (used by tests) |

Example systemd unit:

```ini
[Unit]
Description=Life Simulator server
After=network.target

[Service]
ExecStart=/opt/lifesim/life-simulator-server.x86_64 --headless -- --server --port 24555
WorkingDirectory=/opt/lifesim
Restart=on-failure
User=lifesim

[Install]
WantedBy=multi-user.target
```

Profiles are stored in the user data folder of the account running the server (on Linux, `~/.local/share/godot/app_userdata/Life Simulator/server_profiles/`). Back that folder up.

### Hosting requirements

* **Network:** a public IP, or port forwarding for **UDP 24555** (open it in the firewall too). Each player uses roughly 2–5 KB/s, mostly movement.
* **Hardware:** the server doesn't render anything. One CPU core and 256 MB of RAM is plenty for the 16-player limit (`MAX_CLIENTS`).
* **Version:** clients and server must run the same game version (`PROTOCOL` in `MultiplayerManager.gd`). Mismatched clients get a clear error.

## What's synchronised

| Synchronised | Not synchronised (simulated on each device) |
| --- | --- |
| Players' positions, facing, animation and current vehicle | Residents (NPCs) and traffic |
| Names, appearance, outfit changes | Each player's needs |
| Chat | Mission objective progress (rewards are validated by the server) |
| World time and weather | Interiors (each player sees their own home) |
| All money, items, property, vehicles and businesses (server authoritative) | |

## Testing

`tools/run_net_test.sh` runs two automated phases on localhost.

1. **A headless dedicated server and two clients.** Client A tries to cheat: it forges £9,999,999 locally and buys a piano, forges an item and uses it, claims a reward twice, submits an impossible race result, works without a job, and sends an unknown action. The server must reject every one, and the client's forged values must be overwritten. Both clients must then see each other's chat and movement.
2. **"Host Game" mode.** A playing host and one client, checking chat and movement both ways.

Last run: dedicated server phase 29/29 checks passed, host phase 13/13 checks passed. It also passed against the exported Linux server binary.
