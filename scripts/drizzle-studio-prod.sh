#!/usr/bin/env bash
# Open Drizzle Studio against PROD (self-host box) in your browser.
#   Prod DB  : aio box Supabase Postgres (127.0.0.1:54322) — NOT internet-exposed.
#   Method   : SSH tunnel 55432 -> aio:54322, run drizzle-kit studio locally, open browser.
#   Studio   : https://local.drizzle.studio   (proxies 127.0.0.1:4983)
#
# ⚠️  Drizzle Studio has READ/WRITE access to the live prod DB. Edits are real.
#
# Requires: ssh alias `aio` reachable, Bun installed. Ctrl-C stops studio + tunnel.
set -euo pipefail
cd "$(dirname "$0")/.."

BOX_HOST="aio"
BOX_ENV="~/hosting/fc-os-web-local/.env"
LOCAL_PORT=55432          # avoid clash with local dev Supabase (54322)
BOX_PORT=54322
STUDIO_PORT=4983
STUDIO_URL="https://local.drizzle.studio"

echo "⚠️  PROD Drizzle Studio — this is READ/WRITE on the live self-host DB. Edits are real."
echo

# 1. Fetch prod DATABASE_URL from the box (kept only in this process's env).
echo "── Fetching prod DATABASE_URL from ${BOX_HOST} …"
PROD_URL="$(ssh "$BOX_HOST" "grep -m1 '^DATABASE_URL=' $BOX_ENV" | sed 's/^DATABASE_URL=//; s/^["'\'']//; s/["'\'']$//')"
if [[ -z "$PROD_URL" ]]; then
  echo "Could not read DATABASE_URL from ${BOX_HOST}:${BOX_ENV}" >&2
  exit 1
fi

# 2. Rewrite the box-local host:port to the tunnel endpoint.
TUNNEL_URL="${PROD_URL//127.0.0.1:${BOX_PORT}/127.0.0.1:${LOCAL_PORT}}"
if [[ "$TUNNEL_URL" == "$PROD_URL" ]]; then
  echo "Prod URL did not contain 127.0.0.1:${BOX_PORT} — refusing to guess. Got: ${PROD_URL%%@*}@…" >&2
  exit 1
fi

# 3. Open the SSH tunnel.
echo "── Opening tunnel  127.0.0.1:${LOCAL_PORT} -> ${BOX_HOST}:${BOX_PORT} …"
ssh -N -L "${LOCAL_PORT}:127.0.0.1:${BOX_PORT}" "$BOX_HOST" &
TUNNEL_PID=$!

STUDIO_PID=""
cleanup() {
  [[ -n "$STUDIO_PID" ]] && kill "$STUDIO_PID" 2>/dev/null || true
  kill "$TUNNEL_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# helper: wait until a local TCP port accepts a connection
wait_for_port() {
  local port="$1" tries="${2:-30}"
  for _ in $(seq 1 "$tries"); do
    if (exec 3<>"/dev/tcp/127.0.0.1/${port}") 2>/dev/null; then exec 3>&- 3<&-; return 0; fi
    sleep 0.5
  done
  return 1
}

# 4. Wait for the tunnel to be live.
if ! wait_for_port "$LOCAL_PORT"; then
  echo "Tunnel port ${LOCAL_PORT} never came up." >&2
  exit 1
fi

# 5. Launch Drizzle Studio pointed at the tunnel (env var beats repo .env via dotenv).
echo "── Starting Drizzle Studio …"
DATABASE_URL="$TUNNEL_URL" bunx drizzle-kit studio --config drizzle.config.ts &
STUDIO_PID=$!

# 6. Wait for studio, then open the browser.
if wait_for_port "$STUDIO_PORT"; then
  echo "── Opening ${STUDIO_URL} in Arc"
  # Arc (Chromium) — Safari/WebKit blocks the studio's self-signed-cert XHR to :4983.
  open -a "Arc" "$STUDIO_URL" 2>/dev/null \
    || open "$STUDIO_URL" 2>/dev/null \
    || echo "Open ${STUDIO_URL} manually (use a Chromium browser)."
else
  echo "Studio port ${STUDIO_PORT} never came up — open ${STUDIO_URL} manually." >&2
fi

echo
echo "Connected to PROD. Ctrl-C to stop studio + tunnel."
wait "$STUDIO_PID"
