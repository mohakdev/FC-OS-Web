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
| Proxy | Cloudflare Worker forwarding `fc-os.tech` → the funnel | Cloudflare (Worker `fc-os-proxy`, `fc-os.tech` bound as Custom Domain) |

### Why the Worker is required (not a plain CNAME)

Tailscale Funnel serves **only** its own `*.ts.net` hostname and TLS cert — it
routes by SNI. A Cloudflare CNAME `fc-os.tech → claw…ts.net` sends SNI
`fc-os.tech`, which the funnel rejects (cert/SNI mismatch). A Worker works
because its `fetch()` to the `ts.net` URL sends the **correct** SNI. The Worker
also sets `X-Forwarded-Host` and rewrites redirect `Location` headers that would
otherwise leak the `ts.net` hostname.

### The Worker

```js
const ORIGIN = "https://claw.tail3b56f7.ts.net";

export default {
  async fetch(request) {
    const inUrl = new URL(request.url);
    const originUrl = new URL(inUrl.pathname + inUrl.search, ORIGIN);

    const headers = new Headers(request.headers);
    headers.set("X-Forwarded-Host", inUrl.hostname);
    headers.set("X-Forwarded-Proto", "https");

    const resp = await fetch(new Request(originUrl, {
      method: request.method,
      headers,
      body: request.body,
      redirect: "manual",
    }));

    const loc = resp.headers.get("Location");
    if (loc && loc.includes("claw.tail3b56f7.ts.net")) {
      const h = new Headers(resp.headers);
      h.set("Location", loc.replace(/https?:\/\/claw\.tail3b56f7\.ts\.net/g, `https://${inUrl.hostname}`));
      return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: h });
    }
    return resp;
  },
};
```

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
