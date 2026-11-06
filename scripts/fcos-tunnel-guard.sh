#!/usr/bin/env bash
# FC OS: keep the public path (Cloudflare edge -> Tunnel "claw" -> Traefik -> app) serving.
#
# Path since 2026-11-05: fc-os.tech is a proxied CNAME to tunnel claw. cloudflared
# (user unit cloudflared-claw) reaches the tunnel edge only through WARP. claw is enrolled
# in Zero Trust team srm2k29, and its device profile is MASQUE with Split Tunnels in
# Include mode = 198.41.192.0/24 + 198.41.200.0/24 only. The campus blocks port 7844 and
# resets the argotunnel SNIs, so without WARP the tunnel can't connect at all. See
# docs/SELF_HOSTING.md and docs/latency-report.md §6.2.
#
# Failure modes this repairs:
#   * WARP disconnected / stuck (after power cut, Wi-Fi flap) -> tunnel has 0 connections
#     -> Cloudflare serves 530 (error 1033) on fc-os.tech.
#   * cloudflared wedged with 0 ready connections.
#   * /etc/hosts pins for the ZT team missing. WARP's DNS proxy dies while it re-registers,
#     so without the pins re-enrollment can't resolve the team domain.
#
# Runs as root from fcos-tunnel-guard.service (boot) and .timer (every 5 min).
# Idempotent: on a healthy system it probes once and exits 0 without touching anything.
set -uo pipefail

APP_URL="http://127.0.0.1"          # Coolify Traefik
APP_HOST="fc-os.tech"
PUBLIC_URL="https://fc-os.tech/login"
METRICS="http://127.0.0.1:20241/ready"
TUNNEL_USER="opdhaker"
TUNNEL_UNIT="cloudflared-claw.service"
STATE_DIR="/var/lib/fcos-tunnel-guard"
WARP_STAMP="$STATE_DIR/last-warp-restart"
WARP_COOLDOWN=900   # at most one warp-svc restart per 15 min
READY_TIMEOUT=300
HOSTS_MARK="fcos-warp-zt"
HOSTS_PINS=(
  "104.19.194.29 srm2k29.cloudflareaccess.com"
  "162.159.138.105 zero-trust-client.cloudflareclient.com"
)

log() { logger -t fcos-tunnel-guard -- "$*"; echo "fcos-tunnel-guard: $*"; }
mkdir -p "$STATE_DIR"

user_systemctl() {
  local uid; uid="$(id -u "$TUNNEL_USER")"
  runuser -u "$TUNNEL_USER" -- env XDG_RUNTIME_DIR="/run/user/$uid" systemctl --user "$@"
}

wait_ready() {
  local deadline=$(( SECONDS + READY_TIMEOUT ))
  while (( SECONDS < deadline )); do
    ip route get 1.1.1.1 >/dev/null 2>&1 && return 0
    sleep 10
  done
  return 1
}

have_internet() {
  curl -sf --max-time 10 -o /dev/null \
    -H 'accept: application/dns-json' \
    'https://cloudflare-dns.com/dns-query?name=cloudflare.com&type=A'
}

warp_connected() { warp-cli --accept-tos status 2>/dev/null | grep -q 'Connected'; }

tunnel_ready() {
  local n
  n="$(curl -sf --max-time 5 "$METRICS" 2>/dev/null | jq -r '.readyConnections // 0' 2>/dev/null)"
  [[ "${n:-0}" -gt 0 ]]
}

# 0 = serving, 1 = Cloudflare can't reach the tunnel (52x/530), 2 = indeterminate (000)
probe_public() {
  local code last=""
  for _ in 1 2 3; do
    code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 25 "$PUBLIC_URL" 2>/dev/null)"
    case "$code" in
      2??|3??|401|403) return 0 ;;
      52?|530) log "public probe returned ${code}: Cloudflare cannot reach tunnel"; return 1 ;;
    esac
    last="$code"; sleep 5
  done
  [[ "$last" == "000" ]] && { log "public probe: no response 3x (uplink/Cloudflare); leaving things alone"; return 2; }
  log "public probe returned '${last}'"; return 1
}

ensure_hosts_pins() {
  local pin
  for pin in "${HOSTS_PINS[@]}"; do
    grep -qF "$pin" /etc/hosts || { echo "$pin # $HOSTS_MARK" >> /etc/hosts; log "re-added hosts pin: $pin"; }
  done
}

restart_tunnel() {
  log "restarting $TUNNEL_UNIT"
  user_systemctl restart "$TUNNEL_UNIT"
  sleep 15
}

restart_warp() {
  local now last=0
  now="$(date +%s)"
  [[ -f "$WARP_STAMP" ]] && last="$(cat "$WARP_STAMP" 2>/dev/null || echo 0)"
  if (( now - last < WARP_COOLDOWN )); then
    log "warp-svc restart suppressed (last $(( now - last ))s ago)"; return 1
  fi
  echo "$now" > "$WARP_STAMP"
  log "restarting warp-svc"
  systemctl restart warp-svc
  for _ in $(seq 1 30); do warp_connected && break; sleep 3; done
  warp_connected || log "WARP still not connected after restart"
  return 0
}

# ---------------------------------------------------------------------- main ----
wait_ready || { log "no route after ${READY_TIMEOUT}s; retry next tick"; exit 0; }

if ! have_internet; then
  log "no internet uplink; kicking the captive-portal login"
  systemctl start srmist-portal-login.service
  sleep 20
  have_internet || { log "still no uplink; retry next tick"; exit 0; }
fi

ensure_hosts_pins

# The app itself is Coolify's to restart; just record it, since nothing below can fix it.
curl -sf --max-time 5 -o /dev/null -H "Host: ${APP_HOST}" "$APP_URL/login" ||
  log "app via Traefik (Host: ${APP_HOST}) not responding: check the container in Coolify"

if ! warp_connected; then
  log "WARP not connected; trying warp-cli connect"
  warp-cli --accept-tos connect >/dev/null 2>&1
  sleep 10
  warp_connected || restart_warp
fi

if ! user_systemctl is-active --quiet "$TUNNEL_UNIT"; then
  log "$TUNNEL_UNIT not active; starting it"
  user_systemctl start "$TUNNEL_UNIT"; sleep 15
fi
tunnel_ready || restart_tunnel

probe_public; verdict=$?
(( verdict == 0 || verdict == 2 )) && exit 0

restart_tunnel
probe_public; verdict=$?
(( verdict == 0 )) && { log "recovered after restarting cloudflared"; exit 0; }

if restart_warp; then
  restart_tunnel
  probe_public; verdict=$?
  (( verdict == 0 )) && { log "recovered after restarting warp-svc + cloudflared"; exit 0; }
fi

log "TUNNEL STILL DOWN after cloudflared + warp restarts. Roll back to the Funnel: see docs/production-runbook.md"
exit 1
