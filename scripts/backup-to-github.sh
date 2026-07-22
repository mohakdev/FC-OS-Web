#!/usr/bin/env bash
# Encrypted DB backup -> private GitHub repo (free offsite storage). AIO-box specific.
#
# Dumps the local Supabase Postgres (fc-os.tech's prod DB), compresses, encrypts
# with `age`, and commits+pushes the ciphertext to a private backup repo over a
# dedicated SSH deploy key. GitHub only ever sees encrypted blobs.
#
# STANDALONE / NON-AGENTIC: pure shell + coreutils + pg_dump/gzip/age/git. No
# Claude, no network calls beyond the git push. Safe to run from cron/systemd
# forever, independent of any AI usage limits.
#
# One-time Box setup (creates the secrets this reads) is documented in
# docs/production-runbook.md ("Backups"). Config lives OUTSIDE the repo in
# ~/.config/fcos-backup/backup.env so no secrets are committed here.
#
#   bash ~/hosting/fc-os-web-local/scripts/backup-to-github.sh
#   bash ~/hosting/fc-os-web-local/scripts/backup-to-github.sh --push-only
#
# --push-only skips the dump and just pushes whatever is unpushed, then applies the
# freshness gate. That is the morning catch-up for a night when the campus network was
# down at 03:00 — it must not manufacture a second dump of the same day.
set -euo pipefail

MODE="${1:-full}"
case "$MODE" in
  full|--push-only) ;;
  *) echo "usage: $(basename "$0") [--push-only]"; exit 2 ;;
esac

CONFIG="${FCOS_BACKUP_CONFIG:-$HOME/.config/fcos-backup/backup.env}"

# --- Config -----------------------------------------------------------------
# backup.env must define: BACKUP_REPO_DIR, AGE_RECIPIENT
# and may override:       KEEP (default 30), LOCAL_URL, SSH_KEY, MIN_BYTES
[ -f "$CONFIG" ] || { echo "FATAL: config not found: $CONFIG (see docs/production-runbook.md 'Backups')"; exit 1; }
# shellcheck source=/dev/null
. "$CONFIG"

LOCAL_URL="${LOCAL_URL:-postgres://postgres:postgres@127.0.0.1:54322/postgres}"
KEEP="${KEEP:-30}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/fcos-backup}"
MIN_BYTES="${MIN_BYTES:-1024}"   # abort if the encrypted dump is smaller than this

: "${BACKUP_REPO_DIR:?FATAL: BACKUP_REPO_DIR not set in $CONFIG}"
: "${AGE_RECIPIENT:?FATAL: AGE_RECIPIENT not set in $CONFIG}"

# --- Preflight (fail loud + early if a tool or path is missing) -------------
for bin in pg_dump gzip age git; do
  command -v "$bin" >/dev/null 2>&1 || { echo "FATAL: '$bin' not found in PATH"; exit 1; }
done
[ -d "$BACKUP_REPO_DIR/.git" ] || { echo "FATAL: $BACKUP_REPO_DIR is not a git clone (run the one-time setup)"; exit 1; }
[ -f "$SSH_KEY" ] || { echo "FATAL: SSH deploy key not found: $SSH_KEY"; exit 1; }

TS=$(date +%Y%m%d-%H%M%S)
OUT="$BACKUP_REPO_DIR/db-$TS.sql.gz.age"
export GIT_SSH_COMMAND="ssh -i $SSH_KEY -o IdentitiesOnly=yes"

# Runs append to one log file (see fcos-backup.service) — stamp each one so the file is
# readable months later.
echo "=== $(date -Is) mode=${MODE} ==="

if [ "$MODE" = "--push-only" ]; then
  echo "==> [1-3/4] skipped (--push-only)"
  SIZE=0
else
  echo "==> [1/4] Dump + gzip + encrypt -> $(basename "$OUT")"
  # pipefail makes a failed pg_dump abort the whole pipe (no half-written blob committed).
  pg_dump "$LOCAL_URL" --no-owner --no-privileges | gzip -9 | age -r "$AGE_RECIPIENT" > "$OUT"

  echo "==> [2/4] Sanity gate (>= ${MIN_BYTES} bytes)"
  SIZE=$(wc -c < "$OUT")
  if [ "$SIZE" -lt "$MIN_BYTES" ]; then
    echo "ABORT: encrypted dump is only ${SIZE} bytes (< ${MIN_BYTES}) — refusing to commit a broken backup"
    rm -f "$OUT"
    exit 1
  fi
  echo "    ${SIZE} bytes"

  echo "==> [3/4] Prune working dir to newest $KEEP (git history keeps the rest)"
  # Newest-first; delete everything past the Nth. -r via reverse sort; NUL-safe not needed (our names have no spaces).
  ls -1t "$BACKUP_REPO_DIR"/db-*.sql.gz.age 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r old; do
    echo "    rm $(basename "$old")"; rm -f "$old"
  done
fi

echo "==> [4/4] Commit + push"
cd "$BACKUP_REPO_DIR"
git add -A
if git diff --cached --quiet; then
  echo "    nothing changed — skipping commit"
else
  git commit -q -m "backup $TS"
  git --no-pager log -1 --oneline
fi

# The dump is already safe on disk; a failed push must not abort the script before the
# freshness check below reports how bad the situation actually is.
set +e
BRANCH=$(git rev-parse --abbrev-ref HEAD)

# Push retries: at 03:00 the campus network is regularly mid-reconnect, and a single failed
# push used to leave commits sitting local indefinitely — that is how the offsite copy went
# 7 days stale without anyone noticing. `git push` sends every unpushed commit, so this also
# catches up whatever previous nights left behind.
PUSHED=0
for attempt in 1 2 3; do
  if git push -q origin "$BRANCH" 2>&1; then
    PUSHED=1
    break
  fi
  echo "    push attempt ${attempt} failed"
  [ "$attempt" -lt 3 ] && sleep $((attempt * 30))
done

AHEAD=$(git rev-list --count "origin/${BRANCH}..${BRANCH}" 2>/dev/null || echo "?")
if [ "$PUSHED" -eq 1 ]; then
  echo "    pushed; offsite is current"
else
  echo "WARN: push failed 3x — ${AHEAD} commit(s) exist only on this box"
fi

# Freshness gate. This is the alarm that was missing: a backup that never leaves the box is
# not a backup, and until now nothing ever said so out loud.
REMOTE_EPOCH=$(git log -1 --format=%ct "origin/${BRANCH}" 2>/dev/null || echo 0)
AGE_H=$(( ( $(date +%s) - REMOTE_EPOCH ) / 3600 ))
echo "    offsite HEAD is ${AGE_H}h old ($(git log -1 --format=%h "origin/${BRANCH}" 2>/dev/null))"

if [ "$MODE" = "--push-only" ]; then
  echo "DONE (push-only)."
else
  echo "DONE. Latest backup: $(basename "$OUT") (${SIZE} bytes)"
fi

if [ "$AGE_H" -gt 48 ]; then
  echo "FAIL: offsite backup is ${AGE_H}h old (> 48h) — the GitHub copy is stale"
  exit 1
fi
[ "$PUSHED" -eq 1 ] || exit 1
exit 0
