# Self-Hosting & Public Exposure

FC OS runs on one box (`claw`) on SRMIST dorm Wi-Fi, deployed by **Coolify**. Ops
procedures live in `production-runbook.md`.

## Path

```
Browser → https://fc-os.tech (+ www)
  → Cloudflare Worker fc-os-proxy   sets X-Orig-Host, edge-caches static assets
  → Tailscale Funnel :443           claw.tail3b56f7.ts.net
  → Caddy shim 127.0.0.1:18080      Host / X-Forwarded-Host ← X-Orig-Host
  → Coolify Traefik :80             routes by Host
  → app container :3000  ↔  Coolify Postgres 17 (internal network)
```

Why:
- SRMIST allows only TCP 443 out. `cloudflared` needs 7844, so Funnel is the only inbound path.
- Funnel only accepts SNI `claw.tail3b56f7.ts.net`, so a CNAME won't work. The Worker's
  `fetch()` sends the right SNI.
- Every request reaches the box as `Host: claw…ts.net`. The shim (`scripts/caddy/Caddyfile`)
  restores the real host, so Traefik can route many apps through one Funnel. A new
  `<app>.fc-os.tech` needs a Custom Domain on the Worker plus a Coolify domain.
- Coolify domains are `http://…`. TLS ends at Cloudflare/Funnel; Traefik must not try Let's Encrypt.
- The Worker caches `/_next/static`, images and fonts at the edge (`X-Edge-Cache: MISS → HIT`),
  so only HTML/API requests take the slow DERP relay.

## Deploy

Push to `feat/local-self-hosting`, then click **Deploy** on the app in Coolify
(`http://claw:8000`, tailnet only). There are no webhooks, because nothing inbound reaches the box.
- Build: the `Dockerfile` (Bun build → Node `standalone` runtime). The build needs no DB and no
  network beyond package install. Don't add `next/font/google` or any other build-time fetch.
- Source: Coolify deploy key, repo URL `ssh://git@ssh.github.com:443/founder-srm/FC-OS-Web.git`
  (port 22 is blocked).
- Env vars are Coolify runtime vars (see `.env.example`), never build vars.
- Coolify's health check is **off** (the image has no curl/wget); the Dockerfile `HEALTHCHECK` is used instead.
- Worker changes: `npx wrangler deploy -c workers/wrangler.jsonc`. The Custom Domains are set in the dashboard.

## Debug: probe top-down

```bash
curl -I https://fc-os.tech                                      # L1 public
ssh aio "curl -sI -H 'X-Orig-Host: fc-os.tech' http://127.0.0.1:18080"   # L2 shim → Traefik → app
ssh aio "curl -sI -H 'Host: fc-os.tech' http://127.0.0.1"        # L3 Traefik → app
```

| Symptom | Meaning / fix |
|---|---|
| L1 **525** | Stale Funnel ingress (typically after a power cut), not the app. `fcos-funnel-guard` (boot + every 5 min) re-arms the Funnel and restarts tailscaled. `journalctl -u fcos-funnel-guard -n 50` |
| L1 503 "Site not available" | Traefik has no route: app stopped, or a domain is missing in Coolify |
| L2 fails, L3 ok | Caddy: `systemctl status caddy` |
| L3 fails | App: container logs in Coolify |
| "Invalid Server Actions request" | Forwarded host mismatch. Check the shim; `allowedOrigins` in `next.config.ts` is the backstop |

`curl https://claw.tail3b56f7.ts.net` from a tailnet device gives a false OK: MagicDNS routes it
straight to the node. Test the real path through `fc-os.tech`.
