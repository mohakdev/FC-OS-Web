#!/usr/bin/env bash
# FC OS: keep the Tailscale Funnel actually serving traffic from the public internet.
#
# Why this exists: after a power cut the box auto-boots, and tailscaled can start before
# the NIC / campus captive portal is up. It recovers its own tailnet connectivity, but the
# Funnel ingress registration made in that dead window can stay stale — `tailscale funnel
# status` keeps saying "Funnel on" while Tailscale's ingress servers close every inbound
# TLS connection. Cloudflare then serves 525 on https://fc-os.tech even though the app is
# perfectly healthy. See docs/SELF_HOSTING.md ("525 = funnel ingress, not the app").
#
# Runs as root from fcos-funnel-guard.service (boot) and .timer (every 5 min).
# Idempotent: on a healthy system it probes once and exits 0 without touching anything.
set -uo pipefail

FUNNEL_HOST="claw.tail3b56f7.ts.net"
APP_URL="http://localhost:3005"
PUBLIC_URL="https://fc-os.tech/"
STATE_DIR="/var/lib/fcos-funnel-guard"
RESTART_STAMP="$STATE_DIR/last-tailscaled-restart"
RESTART_COOLDOWN=900   # seconds; at most one tailscaled restart per 15 min
READY_TIMEOUT=300      # seconds to wait for network + tailscaled at boot

log() { logger -t fcos-funnel-guard -- "$*"; echo "fcos-funnel-guard: $*"; }

mkdir -p "$STATE_DIR"

# ---------------------------------------------------------------- readiness ----
# At boot everything below is meaningless until the box has a route and tailscaled has
# finished coming up. Wait, bounded — the timer will retry if we give up.
wait_ready() {
  local deadline=$(( SECONDS + READY_TIMEOUT ))
  while (( SECONDS < deadline )); do
    if ip route get 1.1.1.1 >/dev/null 2>&1 &&
       [[ "$(tailscale status --json 2>/dev/null | jq -r '.BackendState // empty')" == "Running" ]]; then
      return 0
    fi
    sleep 10
  done
  return 1
}

# Is the box actually on the internet at all? If the uplink is down (power cut, portal not
# through yet) there is nothing for us to fix, and restarting tailscaled would be noise.
have_internet() {
  curl -sf --max-time 10 -o /dev/null \
    -H 'accept: application/dns-json' \
    'https://cloudflare-dns.com/dns-query?name=cloudflare.com&type=A'
}

# ------------------------------------------------------------------- probing ----
# Probe the real public path: box -> Cloudflare edge -> Worker -> funnel ingress -> box.
#
# Two dead ends this deliberately avoids:
#   * `curl https://claw.tail3b56f7.ts.net/` on the box is a false green — MagicDNS
#     resolves it to the node's own tailnet IP (100.65.21.64), so it never touches
#     Tailscale's ingress and answers 200 during a total outage.
#   * Pinning the public ingress IP with --resolve fixes that from an outside machine, but
#     from the node itself the connection never completes (measured: 000 while the funnel
#     was verified healthy from a laptop). So that check belongs on your laptop, not here.
#
# Cloudflare reports an unreachable origin as 52x, which is exactly the signal we want.
# Retried, because a probe fired seconds after a re-arm can still catch Cloudflare holding
# a dead connection to the origin — one 000 is noise, three in a row is a signal.
probe_funnel() {
  local code last=""
  for _ in 1 2 3; do
    code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 25 "$PUBLIC_URL" 2>/dev/null)"
    case "$code" in
      2??|3??|401|403) return 0 ;;
      52?) log "public probe returned ${code} — Cloudflare cannot reach the funnel"; return 1 ;;
    esac
    last="$code"
    sleep 5
  done
  if [[ "$last" == "000" ]]; then
    log "public probe got no response 3x (Cloudflare or uplink, not the funnel); leaving things alone"
    return 2
  fi
  log "public probe returned '${last}'"
  return 1
}

# ------------------------------------------------------------------ remedies ----
serve_config_ok() {
  tailscale serve status --json 2>/dev/null | jq -e \
    --arg hp "${FUNNEL_HOST}:443" --arg app "$APP_URL" \
    '(.AllowFunnel[$hp] == true) and (.Web[$hp].Handlers["/"].Proxy == $app)' >/dev/null
}

rearm_funnel() {
  log "re-arming funnel: ${FUNNEL_HOST}:443 -> ${APP_URL}"
  tailscale funnel --https=443 off >/dev/null 2>&1
  sleep 2
  tailscale funnel --bg --https=443 "$APP_URL" >/dev/null 2>&1
  sleep 5
}

restart_tailscaled() {
  local now last=0
  now="$(date +%s)"
  [[ -f "$RESTART_STAMP" ]] && last="$(cat "$RESTART_STAMP" 2>/dev/null || echo 0)"
  if (( now - last < RESTART_COOLDOWN )); then
    log "tailscaled restart suppressed (last one $(( now - last ))s ago, cooldown ${RESTART_COOLDOWN}s)"
    return 1
  fi
  echo "$now" > "$RESTART_STAMP"
  log "restarting tailscaled"
  systemctl restart tailscaled
  wait_ready || log "tailscaled did not reach Running after restart"
  rearm_funnel
  return 0
}

# ---------------------------------------------------------------------- main ----
if ! wait_ready; then
  log "network/tailscaled not ready after ${READY_TIMEOUT}s; will retry on the next timer tick"
  exit 0
fi

if ! have_internet; then
  # Most likely the campus captive portal, not the link. srmist-portal-ensure.sh retries 6x
  # on a `wlan0 up` event and then gives up until its 20h timer — so if the AP came back
  # slowly after a power cut, the box can sit walled-garden'd for hours with nobody asking
  # again. This 5-minute tick is that missing retry.
  log "no internet uplink; kicking the captive-portal login"
  systemctl start srmist-portal-login.service
  sleep 20
  if ! have_internet; then
    log "still no uplink after portal login; retrying on the next tick"
    exit 0
  fi
  log "uplink restored via portal login"
fi

# The app itself. The funnel only proxies :3005, so a dead app looks like a dead site.
if ! curl -sf --max-time 5 -o /dev/null "$APP_URL"; then
  log "app on ${APP_URL} not responding; restarting pm2-opdhaker"
  systemctl restart pm2-opdhaker
  sleep 10
fi

serve_config_ok || { log "serve/funnel config drifted"; rearm_funnel; }

probe_funnel; verdict=$?
(( verdict == 0 )) && exit 0
(( verdict == 2 )) && exit 0   # indeterminate: not ours to fix, retry next tick

# Step a: re-arm the funnel binding.
rearm_funnel
probe_funnel; verdict=$?
if (( verdict == 0 )); then
  log "recovered after re-arming the funnel"
  exit 0
fi

# Step b: bounce tailscaled (rate-limited), then re-arm and re-probe.
if restart_tailscaled; then
  # Cloudflare may still be holding a dead connection to the origin for a moment.
  sleep 10
  probe_funnel; verdict=$?
  if (( verdict == 0 )); then
    log "recovered after restarting tailscaled"
    exit 0
  fi
fi

# Step c: out of moves.
log "FUNNEL STILL DOWN after re-arm + restart — see docs/production-runbook.md"
exit 1
