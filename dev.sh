#!/bin/bash
# Run the whole stack: redis + Django (8001) + Expo. Ctrl-C stops everything.
set -e
cd "$(dirname "$0")"

# Kill every child process (and their children) on exit or Ctrl-C
trap 'kill 0' EXIT INT TERM

# Free the ports from any previous or agent-driven sessions so this run
# owns the whole stack (stale Metro on 8081 breaks Expo Go connections)
screen -S tbd-metro -X quit 2>/dev/null && echo "[dev] stopped background metro session"
for port in 8001 8081; do
  pids=$(lsof -ti tcp:$port 2>/dev/null || true)
  if [ -n "$pids" ]; then
    kill $pids 2>/dev/null || true
    echo "[dev] freed port $port"
  fi
done
sleep 1

# A previous --tunnel session that died without cleanup leaves a dead
# tunnel URL in app.json, breaking all networking. Always start clean.
python3 - <<'PYEOF'
import json
with open('frontend/app.json') as f: config = json.load(f)
stale = config.get('expo', {}).get('extra', {}).pop('apiUrl', None)
if stale:
    with open('frontend/app.json', 'w') as f: json.dump(config, f, indent=2)
    print(f"[dev] removed stale tunnel override: {stale}")
PYEOF

# Redis (skip if one is already running)
if redis-cli ping >/dev/null 2>&1; then
  echo "[dev] redis already running"
else
  redis-server --save '' --appendonly no >/tmp/tbd-redis.log 2>&1 &
  echo "[dev] redis started (log: /tmp/tbd-redis.log)"
fi

# Django on 0.0.0.0:8001 (the port the frontend expects)
(
  cd backend
  exec ./venv/bin/python manage.py runserver 0.0.0.0:8001
) >/tmp/tbd-backend.log 2>&1 &
echo "[dev] backend started on :8001 (log: /tmp/tbd-backend.log)"

# Expo in the foreground so its interactive keys (i / a / w / r) still work.
# --tunnel routes EVERYTHING through the internet: Metro via Expo's relay and
# the backend via a Cloudflare quick tunnel. Use when the router blocks
# client-to-client LAN traffic (AP isolation). Slower, but bulletproof.
cd frontend
if [ "$1" = "--tunnel" ]; then
  echo "[dev] starting backend tunnel..."
  cloudflared tunnel --url http://localhost:8001 >/tmp/tbd-cloudflared.log 2>&1 &
  TUNNEL_URL=""
  for _ in $(seq 1 30); do
    TUNNEL_URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/tbd-cloudflared.log | head -1)
    [ -n "$TUNNEL_URL" ] && break
    sleep 1
  done
  if [ -z "$TUNNEL_URL" ]; then
    echo "[dev] backend tunnel failed (see /tmp/tbd-cloudflared.log)"
    exit 1
  fi
  echo "[dev] backend tunnel: $TUNNEL_URL"
  # Point the app at the tunnel (extra.apiUrl overrides LAN autodetection)
  python3 - "$TUNNEL_URL" <<'PYEOF'
import json, sys
with open('app.json') as f:
    config = json.load(f)
config.setdefault('expo', {}).setdefault('extra', {})['apiUrl'] = sys.argv[1]
with open('app.json', 'w') as f:
    json.dump(config, f, indent=2)
PYEOF
  # Restore LAN autodetection when the session ends
  trap 'python3 -c "
import json
with open(\"app.json\") as f: config = json.load(f)
config.get(\"expo\", {}).get(\"extra\", {}).pop(\"apiUrl\", None)
with open(\"app.json\", \"w\") as f: json.dump(config, f, indent=2)
"; kill 0' EXIT INT TERM
  npx expo start --tunnel
else
  npm start
fi
