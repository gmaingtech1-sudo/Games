#!/usr/bin/env bash
# Multiplayer integration test: a headless dedicated server and two headless
# clients on localhost. Exit code 0 only if every check passes.
set -u
cd "$(dirname "$0")/.."
GODOT="${GODOT:-godot}"
PORT="${PORT:-24600}"
STAMP="$(date +%s)"
LOG="${LOG_DIR:-/tmp}/lifesim_net_test"
mkdir -p "$LOG"

"$GODOT" --headless --path . -- --server --port "$PORT" --quit-after 70 > "$LOG/server.log" 2>&1 &
SERVER=$!
sleep 3
"$GODOT" --headless --path . res://scenes/tests/net_client_test.tscn -- --role b --port "$PORT" --name "Bob$STAMP" > "$LOG/client_b.log" 2>&1 &
CLIENT_B=$!
sleep 1
"$GODOT" --headless --path . res://scenes/tests/net_client_test.tscn -- --role a --port "$PORT" --name "Alice$STAMP" > "$LOG/client_a.log" 2>&1
A=$?
wait $CLIENT_B
B=$?
kill $SERVER 2>/dev/null
wait $SERVER 2>/dev/null

# Phase 2: "Host Game" mode (one player's game is the server).
"$GODOT" --headless --path . res://scenes/tests/net_client_test.tscn -- --role host --port "$((PORT+1))" --name "Hosty$STAMP" > "$LOG/host.log" 2>&1 &
HOST=$!
sleep 4
"$GODOT" --headless --path . res://scenes/tests/net_client_test.tscn -- --role c --port "$((PORT+1))" --name "Cara$STAMP" > "$LOG/client_c.log" 2>&1
C=$?
wait $HOST
H=$?

grep -h -E "PASS|FAIL|RESULT" "$LOG/client_a.log" "$LOG/client_b.log" "$LOG/host.log" "$LOG/client_c.log"
echo "--- server log ---"
grep -E "\[server\]|\[chat\]" "$LOG/server.log"
echo "client A exit: $A, client B exit: $B, host exit: $H, client C exit: $C"
if [ "$A" -eq 0 ] && [ "$B" -eq 0 ] && [ "$H" -eq 0 ] && [ "$C" -eq 0 ]; then echo "NETWORK TEST PASSED"; exit 0; fi
echo "NETWORK TEST FAILED"; exit 1
