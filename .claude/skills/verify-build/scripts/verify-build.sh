#!/usr/bin/env bash
# Pre-ship gate: proves a change builds and boots the way Coolify will run it.
#
# Coolify builds the repo Dockerfile from git (branch below) on claw (x86_64), so by
# default this exports committed HEAD — exactly what Coolify pulls — and builds it for
# linux/amd64. Steps: lint changed files -> bun test -> docker build -> smoke-run.
#
#   bash .claude/skills/verify-build/scripts/verify-build.sh            # committed HEAD
#   bash .claude/skills/verify-build/scripts/verify-build.sh --working  # working tree as-is
#   bash .claude/skills/verify-build/scripts/verify-build.sh --keep     # keep the image
#
# Exits non-zero on any failure. Never commits or pushes.
set -euo pipefail

DEPLOY_BRANCH="feat/local-self-hosting"
IMAGE="fc-os-web:verify"
PLATFORM="linux/amd64"
T_DIR="${TMPDIR:-/tmp}"
LOG="${T_DIR%/}/fc-os-verify-build.log"

MODE="committed"
KEEP=0
for arg in "$@"; do
  case "$arg" in
    --working) MODE="working" ;;
    --keep) KEEP=1 ;;
    *) echo "usage: $(basename "$0") [--working] [--keep]"; exit 2 ;;
  esac
done

ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"

# --- Bookkeeping --------------------------------------------------------------
STEP_NAMES=()
STEP_RESULTS=()
FAILED=0
record() { # name result seconds
  STEP_NAMES+=("$1")
  STEP_RESULTS+=("$2 ($3s)")
  [ "$2" = "FAIL" ] && FAILED=1
  return 0
}

EXPORT_DIR=""
CONTAINER=""
cleanup() {
  [ -n "$CONTAINER" ] && docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  [ -n "$EXPORT_DIR" ] && rm -rf "$EXPORT_DIR"
  if [ "$KEEP" -eq 0 ]; then docker rmi "$IMAGE" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT

# --- [0/5] Preflight ------------------------------------------------------------
echo "==> [0/5] Preflight"
for bin in git bun docker curl; do
  command -v "$bin" >/dev/null 2>&1 || { echo "FATAL: '$bin' not found in PATH"; exit 1; }
done
docker info >/dev/null 2>&1 || { echo "FATAL: Docker not running — start OrbStack first."; exit 1; }

BRANCH=$(git rev-parse --abbrev-ref HEAD)
if git rev-parse --verify -q "origin/$BRANCH" >/dev/null; then
  BASE="origin/$BRANCH"
else
  BASE="origin/main"
fi

# --- [1/5] Source + ship status ----------------------------------------------
echo "==> [1/5] Source: $MODE ($(git rev-parse --short HEAD) on $BRANCH)"
if [ "$MODE" = "committed" ]; then
  EXPORT_DIR=$(mktemp -d "${T_DIR%/}/fc-os-verify.XXXXXX")
  git archive HEAD | tar -x -C "$EXPORT_DIR"
  ln -s "$ROOT/node_modules" "$EXPORT_DIR/node_modules"
  SRC="$EXPORT_DIR"
else
  SRC="$ROOT"
fi

DIRTY=$(git status --short)
if [ -n "$DIRTY" ]; then
  if [ "$MODE" = "committed" ]; then
    echo "    uncommitted (NOT in this build, Coolify won't see them):"
  else
    echo "    uncommitted (IN this build, but Coolify won't see them until committed + pushed):"
  fi
  echo "$DIRTY" | sed 's/^/      /'
fi
AHEAD=$(git rev-list --count "$BASE..HEAD" 2>/dev/null || echo "?")
BEHIND=$(git rev-list --count "HEAD..$BASE" 2>/dev/null || echo "?")
echo "    vs $BASE: ${AHEAD} ahead, ${BEHIND} behind"
[ "$BRANCH" = "$DEPLOY_BRANCH" ] || echo "    WARN: Coolify deploys '$DEPLOY_BRANCH', you're on '$BRANCH'"

# --- [2/5] Lint changed files -------------------------------------------------
# Repo-wide `biome check` carries pre-existing debt, so gate only on what this ship touches.
echo "==> [2/5] Lint changed files (biome)"
T=$SECONDS
CHANGED=$(
  {
    git diff --name-only --diff-filter=ACMR "$BASE...HEAD" 2>/dev/null || true
    if [ "$MODE" = "working" ]; then
      git diff --name-only --diff-filter=ACMR HEAD
      git ls-files --others --exclude-standard
    fi
  } | grep -E '\.(ts|tsx|js|jsx|mjs|cjs|json|jsonc|css)$' | sort -u || true
)
FILES=()
while IFS= read -r f; do
  [ -n "$f" ] && [ -f "$SRC/$f" ] && FILES+=("$f")
done <<< "$CHANGED"

if [ "${#FILES[@]}" -eq 0 ]; then
  echo "    no changed lintable files vs $BASE — skipped"
  record "lint (changed files)" "SKIP" 0
elif (cd "$SRC" && bunx biome check --vcs-enabled=false --files-ignore-unknown=true \
        --no-errors-on-unmatched "${FILES[@]}"); then
  echo "    ${#FILES[@]} file(s) clean"
  record "lint (changed files)" "PASS" $((SECONDS - T))
else
  echo "    lint failed on changed files (fix, or \`bunx biome check --write <file>\` for FIXABLE ones)"
  record "lint (changed files)" "FAIL" $((SECONDS - T))
fi

# --- [3/5] Unit tests -----------------------------------------------------------
echo "==> [3/5] bun test"
T=$SECONDS
RC=0
OUT=$(cd "$SRC" && bun test 2>&1) || RC=$?
if [ "$RC" -eq 0 ]; then
  echo "$OUT" | tail -3 | sed 's/^/    /'
  record "bun test" "PASS" $((SECONDS - T))
else
  echo "$OUT" | tail -40 | sed 's/^/    | /'
  record "bun test" "FAIL" $((SECONDS - T))
fi

# --- [4/5] Coolify-parity docker build ----------------------------------------
echo "==> [4/5] docker build --platform $PLATFORM (log: $LOG)"
T=$SECONDS
if docker build --platform "$PLATFORM" --progress=plain -t "$IMAGE" "$SRC" >"$LOG" 2>&1; then
  ROUTES=$(grep -cE '^#[0-9]+ [0-9.]+ [├└┌] ' "$LOG" || true)
  echo "    built in $((SECONDS - T))s (${ROUTES} routes)"
  # Placeholder build env has no BETTER_AUTH_URL; the real one is a Coolify runtime var.
  if grep -q "Base URL is not set" "$LOG"; then
    echo "    note: Better Auth 'Base URL is not set' warnings at build time are expected"
  fi
  record "docker build ($PLATFORM)" "PASS" $((SECONDS - T))
  BUILT=1
else
  echo "    BUILD FAILED — last 60 lines:"
  tail -60 "$LOG" | sed 's/^/    | /'
  record "docker build ($PLATFORM)" "FAIL" $((SECONDS - T))
  BUILT=0
fi

# --- [5/5] Smoke run ------------------------------------------------------------
echo "==> [5/5] Smoke run"
T=$SECONDS
if [ "$BUILT" -eq 0 ]; then
  echo "    skipped (no image)"
  record "smoke run" "SKIP" 0
else
  # Same runtime env shape Coolify injects. The probed routes are unauthenticated and
  # never touch the DB, so a dummy URL is fine when local Supabase isn't up.
  if (exec 3<>/dev/tcp/127.0.0.1/54322) 2>/dev/null; then
    DB_URL="postgres://postgres:postgres@host.docker.internal:54322/postgres"
  else
    DB_URL="postgres://smoke:smoke@127.0.0.1:1/smoke"
  fi
  CONTAINER="fcos-verify-$$"
  docker run -d --name "$CONTAINER" --platform "$PLATFORM" -p 127.0.0.1::3000 \
    -e DATABASE_URL="$DB_URL" \
    -e BETTER_AUTH_SECRET="verify-build-throwaway-secret-0123456789" \
    -e BETTER_AUTH_URL="http://localhost:3000" \
    "$IMAGE" >/dev/null
  PORT=$(docker port "$CONTAINER" 3000/tcp | head -1 | sed 's/.*://')
  URL="http://127.0.0.1:$PORT"

  READY=0
  for _ in $(seq 1 45); do
    if curl -s -o /dev/null --max-time 2 "$URL/login"; then READY=1; break; fi
    sleep 1
  done

  SMOKE_OK=1
  check() { # label expected-description actual ok(0/1)
    if [ "$4" -eq 1 ]; then echo "    ok   $1 -> $3"; else echo "    FAIL $1 -> $3 (want $2)"; SMOKE_OK=0; fi
  }
  if [ "$READY" -eq 0 ]; then
    echo "    container never answered within 45s"
    SMOKE_OK=0
  else
    # `/` mirrors the Dockerfile HEALTHCHECK (any status < 400 is healthy).
    S=$(curl -s -o /dev/null -w '%{http_code}' "$URL/")
    check "GET /" "<400" "$S" $([ "$S" -lt 400 ] && echo 1 || echo 0)
    S=$(curl -s -o /dev/null -w '%{http_code}' "$URL/login")
    check "GET /login" "200" "$S" $([ "$S" = "200" ] && echo 1 || echo 0)
    # proxy.ts must bounce anonymous dashboard requests to /login.
    R=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "$URL/dashboard/opus")
    GATED=0
    [[ "$R" == "307 "*"/login" ]] && GATED=1
    check "GET /dashboard/opus (anon)" "307 -> /login" "$R" "$GATED"
  fi

  if [ "$SMOKE_OK" -eq 1 ]; then
    record "smoke run" "PASS" $((SECONDS - T))
  else
    echo "    container logs (tail):"
    docker logs "$CONTAINER" 2>&1 | tail -30 | sed 's/^/    | /'
    record "smoke run" "FAIL" $((SECONDS - T))
  fi
fi

# --- Summary -----------------------------------------------------------------------
echo
echo "── verify-build: $MODE @ $(git rev-parse --short HEAD) ($BRANCH)"
for i in "${!STEP_NAMES[@]}"; do
  printf "   %-28s %s\n" "${STEP_NAMES[$i]}" "${STEP_RESULTS[$i]}"
done
echo
if [ "$FAILED" -eq 0 ]; then
  echo "READY TO SHIP"
  [ "$MODE" = "working" ] && [ -n "$DIRTY" ] && echo "   (working tree — commit, then re-run without --working to verify what Coolify gets)"
  [ "$AHEAD" != "0" ] && [ "$AHEAD" != "?" ] && echo "   ${AHEAD} commit(s) not pushed — Coolify deploys only after: git push origin $BRANCH"
  exit 0
else
  echo "NOT READY — see FAIL steps above (build log: $LOG)"
  exit 1
fi
