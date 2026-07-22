#!/usr/bin/env bash
# FC OS: keep the local Supabase stack — including the edge runtime — up across reboots.
#
# Why this exists: the Supabase CLI creates supabase_edge_runtime_<project> with restart
# policy `no` while every other container in the stack gets `unless-stopped`. So a reboot
# (this box loses power regularly) leaves the edge runtime down forever, silently — it sat
# `Exited (255)` from 2026-06-25 until someone went looking. The CLI resets the policy
# every time it recreates the container, so this has to be re-applied, not set once.
#
# Runs as root from fcos-supabase-guard.service (boot) and .timer (every 10 min).
# Idempotent: on a healthy stack it checks and exits 0 without touching anything.
set -uo pipefail

PROJECT="fc-os-web"
EDGE="supabase_edge_runtime_${PROJECT}"
FUNCTIONS_URL="http://127.0.0.1:54321/functions/v1/health"

log() { logger -t fcos-supabase-guard -- "$*"; echo "fcos-supabase-guard: $*"; }

docker info >/dev/null 2>&1 || { log "docker not ready; retrying on the next tick"; exit 0; }

containers=$(docker ps -a --filter "name=supabase_.*_${PROJECT}" --format '{{.Names}}')
if [[ -z "$containers" ]]; then
  log "no supabase_*_${PROJECT} containers exist — the stack was never started (supabase start)"
  exit 0
fi

# ---------------------------------------------------- restart policy + liveness ----
while read -r c; do
  [[ -z "$c" ]] && continue

  policy="$(docker inspect "$c" --format '{{.HostConfig.RestartPolicy.Name}}' 2>/dev/null)"
  if [[ "$policy" != "unless-stopped" ]]; then
    log "restart policy of $c was '${policy:-unset}' -> unless-stopped"
    docker update --restart unless-stopped "$c" >/dev/null 2>&1 ||
      log "failed to set restart policy on $c"
  fi

  state="$(docker inspect "$c" --format '{{.State.Status}}' 2>/dev/null)"
  if [[ "$state" != "running" ]]; then
    log "$c is '$state' — starting it"
    docker start "$c" >/dev/null 2>&1 || log "failed to start $c"
  fi
done <<< "$containers"

# ------------------------------------------------------------ functions probe ----
# The edge runtime is currently disabled in supabase/config.toml (deno.land is blocked on
# this network, see the comment there), so the container simply does not exist. That is a
# normal state, not a fault — skip the probe instead of failing every 10 minutes.
if ! docker inspect "$EDGE" >/dev/null 2>&1; then
  exit 0
fi

# Docker saying "running" is not the same as the runtime serving. Probe through kong.
# No auth header on purpose: functions default to verify_jwt, so a healthy stack answers
# 401 and we never have to handle the anon key here. A dead runtime gives 5xx instead.
probe_functions() {
  local code
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "$FUNCTIONS_URL" 2>/dev/null)"
  case "$code" in
    2??|401|403) return 0 ;;
    *) log "functions probe returned '${code}'"; return 1 ;;
  esac
}

if ! probe_functions; then
  log "restarting $EDGE"
  docker restart "$EDGE" >/dev/null 2>&1
  sleep 10
  if probe_functions; then
    log "edge runtime recovered after restart"
  else
    log "EDGE RUNTIME STILL DOWN — check 'docker logs $EDGE'"
    exit 1
  fi
fi

exit 0
