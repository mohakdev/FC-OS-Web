# Self-Hosting & Public Exposure

FC OS runs on one box (`claw`) on SRMIST dorm Wi-Fi, deployed by **Coolify**. Ops
procedures live in `production-runbook.md`.

## Path

```
Browser → https://fc-os.tech (+ www)        proxied CNAME → tunnel "claw"
  → Cloudflare edge (SIN/BOM)                static assets cached by default (immutable /_next/static)
  → Tunnel connections at BOM                cloudflared on claw, --protocol http2
     ↑ carried by WARP (Zero Trust srm2k29, MASQUE, Include split tunnel = 198.41.192/200.0/24 only)
  → Coolify Traefik :80                      routes by Host (fc-os.tech arrives unchanged)
  → app container :3000  ↔  Coolify Postgres 17 (internal network)
```

Why:
- SRMIST allows only TCP 443 out and DPI resets the `*.argotunnel.com` SNIs, so `cloudflared` can't
  reach the tunnel edge directly. **Inside WARP it can**: campus only sees MASQUE to Cloudflare. The
  Include split tunnel keeps everything else (GitHub, backups, Tailscale) on the campus link.
- No Worker and no Caddy shim: the tunnel keeps `Host`, and Cloudflare sets `CF-Connecting-IP`
  (Better Auth reads it).
- Coolify domains are `http://…`. TLS ends at Cloudflare; Traefik must not try Let's Encrypt.
- A new `<app>.fc-os.tech` needs an ingress rule on tunnel `claw`, a proxied CNAME to
  `18415fe3-c233-4142-bc87-207db3f3bb23.cfargotunnel.com`, and a Coolify domain.
- Latency (`latency-report.md` §6.2–6.3): campus median ~0.5 s and no 2–3 s tail, vs 1.26 s on
  the old Funnel path. The rest is mostly edge colo: free-plan India traffic often lands at SIN.
- Fallback: the old path (Worker `fc-os-proxy` → Tailscale Funnel → Caddy shim `:18080`) is parked,
  not deleted. Rollback steps: `production-runbook.md`.

## Deploy

Push to `feat/local-self-hosting`, then click **Deploy** on the app in Coolify
(`http://claw:8000`, tailnet only). There are no webhooks, because nothing inbound reaches the box.
- Build: the `Dockerfile` (Bun build → Node `standalone` runtime). The build needs no DB and no
  network beyond package install. Don't add `next/font/google` or any other build-time fetch.
- Source: Coolify deploy key, repo URL `ssh://git@ssh.github.com:443/founder-srm/FC-OS-Web.git`
  (port 22 is blocked).
- Env vars are Coolify runtime vars (see `.env.example`), never build vars.
- Coolify's health check is **off** (the image has no curl/wget); the Dockerfile `HEALTHCHECK` is used instead.
- Tunnel ingress / DNS: Zero Trust dashboard → Networks → Tunnels → `claw` (remote-managed config).

## Debug: probe top-down

```bash
curl -I https://fc-os.tech                                        # L1 public
ssh aio 'curl -s 127.0.0.1:20241/ready; warp-cli status | head -1' # L2 tunnel + WARP
ssh aio "curl -sI -H 'Host: fc-os.tech' http://127.0.0.1"          # L3 Traefik → app
```

| Symptom | Meaning / fix |
|---|---|
| L1 **530** / error 1033 | Tunnel has no connections: WARP down or cloudflared wedged. `fcos-tunnel-guard` (boot + every 5 min) repairs it. `journalctl -t fcos-tunnel-guard -n 50` |
| WARP "Failed to perform happy eyeballs" | Profile fell back to WireGuard (blocked). Set the device profile `tunnel_protocol` to `masque`, then `sudo systemctl restart warp-svc` |
| WARP "Registration Missing" after re-enroll | Team domain unresolvable while WARP's DNS is down: check the `/etc/hosts` pins (`fcos-warp-zt`) |
| L1 503 "Site not available" | Traefik has no route: app stopped, or a domain is missing in Coolify |
| L3 fails | App: container logs in Coolify |
| "Invalid Server Actions request" | Host/Origin mismatch. `allowedOrigins` in `next.config.ts` is the backstop |
