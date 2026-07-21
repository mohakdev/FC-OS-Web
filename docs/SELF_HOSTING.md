# Self-Hosting & Public Exposure

How `fc-os-local` is hosted on the dorm box and published to the public internet
at **https://fc-os.tech**, plus deploy and debug procedures.

## The constraint that shapes everything

The box (`claw`, CachyOS) runs on the **SRMIST dorm Wi-Fi**, whose firewall is
highly restrictive:

- **All UDP is blocked** (to external endpoints)
- **TCP 7844 is blocked** (Cloudflare Tunnel's edge port)
- Effectively only **TCP 443** web traffic egresses
- No IPv6

Consequences, all verified on this network:

- **`cloudflared` cannot connect** — it needs port 7844 (QUIC/UDP or HTTP2/TCP),
  both blocked. Setting `protocol: http2` doesn't help; http2 still dials 7844.
- **Cloudflare WARP full-tunnel cannot connect** — its MASQUE/WireGuard transport
  is UDP (tried 1701 and 443), all blocked. So WARP can't be used to carry
  cloudflared past the block either.
- **Tailscale works** — it escapes via direct UDP where allowed and DERP-over-443
  otherwise. It is the *only* transport that leaves this network.

So the public path is built on Tailscale, not cloudflared.

## Architecture

```
Browser
  └─ https://fc-os.tech
       └─ Cloudflare Worker (fc-os-proxy)        # rewrites SNI, proxies through
            └─ https://claw.tail3b56f7.ts.net    # Tailscale Funnel (TCP 443)
                 └─ http://localhost:3005         # pm2: fc-os-local (next start)
```

### Components

| Layer | What | Where |
|-------|------|-------|
| App | `fc-os-local` — `bun run start --port 3005`, serves prebuilt `.next` | pm2 on the box, cwd `~/hosting/fc-os-web-local` |
| Tunnel | Tailscale Funnel `:443 → localhost:3005` | `tailscale funnel --bg --https=443 http://localhost:3005` |
| Proxy | Cloudflare Worker forwarding `fc-os.tech` → the funnel | Cloudflare (Worker `fc-os-proxy`, `fc-os.tech` bound as Custom Domain). Source of record: [`workers/fc-os-proxy.js`](../workers/fc-os-proxy.js) |

### Why the Worker is required (not a plain CNAME)

Tailscale Funnel serves **only** its own `*.ts.net` hostname and TLS cert — it
routes by SNI. A Cloudflare CNAME `fc-os.tech → claw…ts.net` sends SNI
`fc-os.tech`, which the funnel rejects (cert/SNI mismatch). A Worker works
because its `fetch()` to the `ts.net` URL sends the **correct** SNI. The Worker
also sets `X-Forwarded-Host` and rewrites redirect `Location` headers that would
otherwise leak the `ts.net` hostname.

### The Worker

Canonical source lives in the repo at **[`workers/fc-os-proxy.js`](../workers/fc-os-proxy.js)**
— edit it there, then paste into the Cloudflare dashboard (or `wrangler deploy`) to
ship. The dashboard Worker and this file must stay in sync.

### Edge caching (the latency fix)

Every request on this stack detours through the Tailscale **DERP relay** — SRMIST
blocks UDP, so there is no direct path and traffic bounces via a relay region over
443. That relay hop is what made the first load feel slow.

The Worker cuts it by serving **immutable static assets from the Cloudflare edge**:
`/_next/static/*`, `/_next/image`, fonts, images, `favicon.ico`, `*.js/.css/.map`.
Next.js content-hashes these filenames, so they are safe to cache forever
(`max-age=31536000, immutable`). On a cache hit the Worker returns from the edge and
never touches the funnel. Only the **HTML document and API routes** still round-trip
to the box — everything else is served near the user.

One gotcha the Worker has to defeat: Next.js stamps `Vary: rsc, next-router-*` on
**every** response, static assets included. Cloudflare only honors
`Vary: Accept-Encoding` — any other `Vary` makes it refuse to cache, so the asset
flaps `MISS → EXPIRED → MISS` and never sticks. The Worker therefore **strips
`Vary`** (and `Set-Cookie`, which the Cache API also refuses) on static responses;
those bytes are identical regardless of the RSC headers, so dropping the `Vary` is
safe. Verify caching with the Worker's own **`X-Edge-Cache: HIT|MISS`** header —
**not** `cf-cache-status`, which Cloudflare does not surface as `HIT` for
`caches.default` hits inside a Worker.

`caches.default` is per–Cloudflare-datacenter, so the *first* visitor in a region
still pays the relay cost for each asset; subsequent visitors there are hot. A fresh
deploy ships new hashed filenames, so it cache-busts itself — no manual purge needed.

Limitation: this Worker does not proxy WebSockets. Add one if the app ever needs
live sockets in production.

## Deploy an update

Pushing to GitHub does **not** update the running site. `next start` serves the
prebuilt `.next` and does not pull or rebuild. Deploy on the box:

```bash
cd ~/hosting/fc-os-web-local
git pull
bun install          # only if dependencies changed
bun run build        # rebuild .next — must succeed before restart
pm2 restart fc-os-local
```

One-liner (only restarts if the build passes):

```bash
cd ~/hosting/fc-os-web-local && git pull && bun install && bun run build && pm2 restart fc-os-local
```

The Cloudflare Worker and Tailscale Funnel point at the **port**, not the build —
they need no change on deploy.

## Debug a deploy / ops issue

The stack is four layers. Probe **top-down**; the first layer that fails is the
culprit.

```bash
# L1  public (Cloudflare Worker + edge)
curl -I https://fc-os.tech
# L2  funnel + app (skips Worker/CF)
curl -I https://claw.tail3b56f7.ts.net
# L3  app direct, on the box (skips funnel)
curl -I http://localhost:3005
```

| Symptom | Check |
|---------|-------|
| Runtime 500 / crash | `pm2 logs fc-os-local --lines 100` |
| Restart loop / status | `pm2 describe fc-os-local` (watch `restarts`, `status`) |
| Build failed on deploy | `bun run build` — read the error |
| L2 fails, L3 ok | Funnel: `tailscale funnel status` |
| L1 fails, L2 ok | Worker/CF: Cloudflare dashboard → Worker → **Logs**, or `npx wrangler tail` |

Rule of thumb: **L3 ok but L1 down = pipe problem** (funnel/Worker), not app code.
**L3 down = app/build problem.** Most common failure: `bun run build` fails, and a
`pm2 restart` onto a half-built `.next` crash-loops — `pm2 logs` shows it at once.

## Notes

- The box auto-connects to SRMIST and re-authenticates the campus captive portal
  on its own; that is configured on the box, outside this repo.
- Reaching the box for ops is over Tailscale SSH from a tailnet device.
- If the box ever moves to a network that allows UDP/7844 (e.g. a phone hotspot),
  the original `cloudflared` tunnel would work directly and this Funnel+Worker
  path becomes optional.
