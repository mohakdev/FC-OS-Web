#!/usr/bin/env bash
# Work against the PROD database (Coolify Postgres `fcos-db` on the box) from your Mac.
#
#   scripts/prod-db.sh push        drizzle-kit push (shows SQL, asks before applying)
#   scripts/prod-db.sh sql <file>  apply a .sql file in one transaction (no TTY needed)
#   scripts/prod-db.sh seed        bun run seed (idempotent reference data)
#   scripts/prod-db.sh studio      Drizzle Studio -> https://local.drizzle.studio
#   scripts/prod-db.sh psql        interactive psql inside the container
#
# The DB has no host port: `push`/`seed`/`studio` open an SSH tunnel 127.0.0.1:55432 -> the
# container's IP on the `coolify` network. The container and its credentials are looked
# up live from Docker on every run (label coolify.resourceName=fcos-db), so nothing secret
# is stored on the Mac and a recreated DB just works. `push`, `seed` and `sql` take a snapshot on
# the box first (~/db-snapshots, newest 10 kept). See docs/pushing-migrations.md.
#
# ⚠️  Everything here is READ/WRITE on the live prod DB.
set -euo pipefail
cd "$(dirname "$0")/.."

BOX_HOST="aio"
DB_LABEL="coolify.resourceName=fcos-db"
LOCAL_PORT=55432          # avoid clash with local dev Supabase (54322)
STUDIO_PORT=4983
STUDIO_URL="https://local.drizzle.studio"
SNAP_KEEP=10

CMD="${1:-}"
case "$CMD" in
  push|seed|studio|psql) ;;
  sql) [[ -f "${2:-}" ]] || { echo "usage: $(basename "$0") sql <file.sql>" >&2; exit 2; } ;;
  *) echo "usage: $(basename "$0") push | sql <file> | seed | studio | psql" >&2; exit 2 ;;
esac

printf '\033[1;31m⚠️  PROD database (%s on %s) — changes are real.\033[0m\n\n' "fcos-db" "$BOX_HOST"

# 1. Resolve container, its coolify-network IP and credentials (kept only in this process).
INFO="$(ssh "$BOX_HOST" "c=\$(docker ps -q --filter label=$DB_LABEL | head -1); [ -n \"\$c\" ] || exit 3;
  docker inspect \"\$c\" --format '{{.Name}} {{(index .NetworkSettings.Networks \"coolify\").IPAddress}}';
  docker inspect \"\$c\" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -E '^POSTGRES_(USER|PASSWORD|DB)='")" \
  || { echo "No running container with label $DB_LABEL on $BOX_HOST." >&2; exit 1; }
read -r CONTAINER DB_IP <<<"$(head -1 <<<"$INFO")"
CONTAINER="${CONTAINER#/}"
env_val() { sed -n "s/^$1=//p" <<<"$INFO"; }
PG_USER="$(env_val POSTGRES_USER)"; PG_PASS="$(env_val POSTGRES_PASSWORD)"; PG_DB="$(env_val POSTGRES_DB)"
[[ -n "$DB_IP" && -n "$PG_USER" && -n "$PG_DB" ]] || { echo "Could not read DB IP/credentials from $CONTAINER." >&2; exit 1; }
echo "── DB container ${CONTAINER} (${DB_IP})"

snapshot() {
  echo "── Snapshot before change …"
  ssh "$BOX_HOST" "mkdir -p ~/db-snapshots && f=~/db-snapshots/pre-${CMD}-\$(date +%Y%m%d-%H%M%S).dump &&
    docker exec $CONTAINER pg_dump -U $PG_USER -d $PG_DB -Fc > \"\$f\" && [ \$(wc -c < \"\$f\") -gt 1024 ] &&
    echo \"   \$f (\$(du -h \"\$f\" | cut -f1))\" &&
    ls -1t ~/db-snapshots/*.dump | tail -n +$((SNAP_KEEP + 1)) | xargs -r rm -f" \
    || { echo "Snapshot failed — aborting before touching prod." >&2; exit 1; }
}

case "$CMD" in
  psql) exec ssh -t "$BOX_HOST" "docker exec -it $CONTAINER psql -U $PG_USER -d $PG_DB" ;;
  sql)
    snapshot
    echo "── Applying $2 (single transaction) …"
    ssh "$BOX_HOST" "docker exec -i $CONTAINER psql -U $PG_USER -d $PG_DB -v ON_ERROR_STOP=1 --single-transaction" < "$2"
    exit ;;
esac

# 2. push / seed / studio: open the tunnel.
ENC_PASS="$(python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$PG_PASS")"
TUNNEL_URL="postgres://${PG_USER}:${ENC_PASS}@127.0.0.1:${LOCAL_PORT}/${PG_DB}"

echo "── Opening tunnel 127.0.0.1:${LOCAL_PORT} -> ${BOX_HOST} -> ${DB_IP}:5432 …"
ssh -N -o ExitOnForwardFailure=yes -L "${LOCAL_PORT}:${DB_IP}:5432" "$BOX_HOST" &
TUNNEL_PID=$!

CHILD_PID=""
cleanup() {
  [[ -n "$CHILD_PID" ]] && kill "$CHILD_PID" 2>/dev/null || true
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

if ! wait_for_port "$LOCAL_PORT"; then
  echo "Tunnel port ${LOCAL_PORT} never came up." >&2
  exit 1
fi

# 3. Run drizzle-kit against the tunnel (env var beats repo .env via dotenv).
if [[ "$CMD" == "push" ]]; then
  snapshot
  echo "── drizzle-kit push (review the SQL; it asks before applying) …"
  DATABASE_URL="$TUNNEL_URL" bunx drizzle-kit push --config drizzle.config.ts --verbose --strict
  exit
fi

if [[ "$CMD" == "seed" ]]; then
  snapshot
  echo "── bun run seed …"
  DATABASE_URL="$TUNNEL_URL" bun run seed
  exit
fi

echo "── Starting Drizzle Studio …"
DATABASE_URL="$TUNNEL_URL" bunx drizzle-kit studio --config drizzle.config.ts &
CHILD_PID=$!

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
wait "$CHILD_PID"
