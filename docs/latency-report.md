# FC OS — request latency report (network path)

**Date:** 2026-10-26 · **Host:** `claw` (Coolify, x86_64, SRMIST dorm Wi-Fi) · **Public:** `fc-os.tech`
**Deployed commit:** `d2a02e8` · **Question:** why does every click lag, and can we skip the
Cloudflare Worker + Tailscale Funnel?

Companion to `performance-report.md` (2026-07), which measured the *app* on-box. This one
measures the *path* to it. Every number was measured unless marked **(derived)**.

---

## 1. Headline

The app answers in **~6 ms** on the box (`/login`); authenticated pages render in **13–20 ms**
(July report). A user on campus Wi-Fi sees a **median ~500 ms** to first byte, and **about 1 in 3
requests takes 1.5–2.1 s** (§3.3). **~95% of every request is network**,
and almost all of it is one hop: **Tailscale Funnel's ingress for this box is in Japan**, so each
dynamic request goes Mumbai → Tokyo → relay → Chennai and back.

The Worker is not the problem (its edge round trip is ~90 ms). Funnel is.

## 2. The current path

```
Browser ──► Cloudflare edge BOM (Worker fc-os-proxy)          ~90 ms incl. TLS (edge HIT)
        ──► Tailscale Funnel ingress, Japan (NetActuate)      TCP RTT from India ~160 ms
        ──► Tailscale tunnel to claw (Chennai, hard NAT)      relay / DERP
        ──► Caddy shim :18080 ─► Traefik :80 ─► app :3000      5–7 ms
```

## 3. Measurements

### 3.1 On the box (app only)

| Probe | TTFB (ms, 8 runs, sorted) |
|---|---|
| L2 Caddy shim → Traefik → app, `/login` | 6 6 6 6 6 7 7 7 |
| L3 Traefik → app, `/login` | 5 5 5 5 5 6 6 7 |
| Authenticated renders (July, `performance-report.md` §3) | Opus board 13.4, heaviest route 20.2 |

```bash
ssh aio "curl -s -o /dev/null -H 'X-Orig-Host: fc-os.tech' -w '%{time_starttransfer}\n' http://127.0.0.1:18080/login"
ssh aio "curl -s -o /dev/null -H 'Host: fc-os.tech' -w '%{time_starttransfer}\n' http://127.0.0.1/login"
```

### 3.2 Public path

| Probe | Result |
|---|---|
| Client → `fc-os.tech` static asset, edge **HIT** (Worker only, origin untouched) | **~90 ms** TTFB (TLS done at ~58 ms) |
| Client → `fc-os.tech/login` (full path), 10 runs | **387 400 422 447 472 474 475 477 486 521 ms** |
| …same, split: TCP / TLS done / TTFB / request leg | ~28 / ~57 / ~440 / **320–440 ms** |
| Box → `fc-os.tech/login` → back into box (full loop), 6 runs | **442 509 1472 1545 2332 2357 ms** (very jittery) |
| Client → Funnel ingress **directly** (no Worker), `/login` | **1150–1600 ms** — TLS ends on the box, so each handshake RTT also crosses Japan + relay (TLS done at 730–1080 ms) |
| Funnel ingress location | `claw.tail3b56f7.ts.net` → `103.84.155.153`, `103.84.155.217` — **NetActuate, JP**; client TCP RTT 155–178 ms |

```bash
curl -s -o /dev/null -w '%{time_connect} %{time_appconnect} %{time_starttransfer}\n' https://fc-os.tech/login
dig +short @1.1.1.1 claw.tail3b56f7.ts.net A        # Funnel ingress IPs
curl -s -o /dev/null -H 'X-Orig-Host: fc-os.tech' --resolve claw.tail3b56f7.ts.net:443:103.84.155.217 \
  -w '%{time_connect} %{time_appconnect} %{time_starttransfer}\n' https://claw.tail3b56f7.ts.net/login
```

> **Caveat — client numbers.** The measuring Mac egresses through **Cloudflare WARP** (IPv6
> `2a09:bac*`), not the campus IP, so §3.2 client rows are WARP-path numbers. The campus view
> (WARP off) is §3.3.

### 3.3 Client on campus Wi-Fi, WARP off

Same Mac, WARP disconnected (`/cdn-cgi/trace`: `warp=off`, egress `103.4.221.29` /
`59.152.80.70`, `loc=IN`). This is what a member on SRMIST Wi-Fi sees.

| Probe | Result |
|---|---|
| Client → Cloudflare edge (`1.1.1.1`) TCP connect | **7 ms** |
| Colo serving `fc-os.tech` (`cf-ray`) | **BOM** 19 of 20; **SIN** 1 of 20 (that request took 1.9 s) |
| Static asset, edge **HIT** (19 of 20) | **88–120 ms** TTFB (TCP 25 ms, TLS done ~60 ms) |
| Static asset, edge **MISS** (5 of 30 across runs) | **1.6–2.5 s**: origin fetch over Funnel |
| `/login` full path, 20 runs, sorted (s) | 0.41 0.43 0.44 0.44 0.44 0.44 0.46 0.48 0.49 0.50 0.50 0.51 0.76 **1.53 1.61 1.68 1.80 1.92 1.93 2.12** |
| …summary | **median ~0.50 s; 7 of 20 (35%) took 1.5–2.1 s**. Bimodal: fast mode ~440 ms, slow mode ~1.8 s |
| Funnel ingress (`103.84.155.153/.217`, JP) TCP connect | **111–128 ms** (WARP: 155–178) |
| Client → Funnel ingress **directly** (no Worker), `/login` ×5 | **1.01–1.45 s** (TLS done 0.70–1.13 s; TLS ends on the box) |
| Client → claw over the tailnet on the **same LAN** (MagicDNS → `100.117.43.58`, direct WireGuard) `/login` ×5 | **31–41 ms** (first run 91 ms). The floor when there is no far-away hop |

Notes:
- On campus, DNS to `1.1.1.1:53` and DoH (`cloudflare-dns.com`) both time out, so the Funnel IPs
  above come from §3.2. On a tailnet device, the system resolver returns the tailnet IP (the known
  false green; see `SELF_HOSTING.md`).
- The slow mode (1.5–2.1 s) matches the jittery box loop in §3.2 (1.4–2.4 s). Both go through
  Funnel ingress → DERP → claw. The Worker and the edge are steady (static HITs never exceed
  ~200 ms). So the tail comes from the Funnel/DERP leg too.
- WARP made the client look *better* than campus reality: it never hit the slow mode in 10 runs.

### 3.4 Box network facts

| Probe | Result |
|---|---|
| `tailscale netcheck` | **UDP: true**, IPv4 yes, IPv6 no, **MappingVariesByDestIP: true** (hard NAT), nearest DERP **Bengaluru 34 ms**; Singapore 52, Tokyo 103 |
| Box → Cloudflare edge (`1.1.1.1`) TCP connect | **4 ms**; `fc-os.tech/cdn-cgi/trace` colo = **BOM** |
| Outbound TCP 443 / 80 | open |
| Outbound TCP **7844** (Cloudflare Tunnel, `region1/2.v2.argotunnel.com`) | **blocked** |
| Outbound TCP 22 / 53 / 853 / 8443 | blocked |
| Argo edge IPs on TCP **443** | TCP connect **open** (10 ms / 35 ms), but see §6: the tunnel handshake is reset |
| Funnel ingress nodes as tailnet peers (`tailscale status --json`) | 24 nodes, **none direct** (`CurAddr` empty): every one is reached through DERP. Only the Mac on the same LAN is direct (`10.3.69.132:41641`) |

`SELF_HOSTING.md` said "UDP blocked → DERP only". **UDP partly works**: STUN to DERP succeeds,
but UDP 7844 doesn't (§6). The NAT is hard, so direct WireGuard paths are only likely toward
peers with public IPs, if their port is allowed at all.

## 4. Where the time goes (derived)

| Segment | ≈ ms |
|---|---|
| Client ↔ Cloudflare edge (TLS + RTT) | 60–90 |
| Edge (BOM) ↔ Funnel ingress (JP) | ~110–150 |
| Funnel ingress ↔ claw over Tailscale | ~150–250, jittery |
| App render | 6–20 |
| **Total** | **~410–520 fast mode; 1500–2100 slow mode (35% of campus requests)** |

A tunnel that lands at Cloudflare's BOM edge directly from the box (4 ms away) would cut the
origin leg from ~300+ ms to **~10–30 ms** **(derived)** — user TTFB ≈ 70–120 ms.

## 5. Options to skip Worker + Funnel

| Option | Feasible? | Expected TTFB | Notes |
|---|---|---|---|
| **A. Cloudflare Tunnel over QUIC** (UDP 7844) | **No**: UDP 7844 dropped (§6) | — | Would have retired Worker, shim, Funnel. |
| **B. Cloudflare Tunnel over HTTP/2** (TCP 7844, or `--edge <ip>:443`) | **No**: 7844 blocked; on 443 the TLS handshake is reset (§6) | — | |
| Quick tunnel (`trycloudflare.com`) | **No**: campus DPI resets that SNI | — | Test-only anyway. |
| **C. India VPS on the tailnet** (e.g. Oracle free tier Mumbai/Hyderabad), Caddy for `fc-os.tech` → claw over Tailscale | **Likely**: the only option left | ~80–130 ms **(derived)** | Adds a box to run. Path is direct only if claw can reach the VPS's WireGuard UDP port; no public peer is direct today, so plan for relay. Mitigation: run a **custom DERP on the same VPS** over TCP 443 with its own domain, so even the relayed path stays in India. Verify with `tailscale ping`. |
| C′. Same VPS, reverse tunnel instead of Tailscale (frp/rathole over TLS 443, own SNI) | Likely | ~80–130 ms **(derived)** | More moving parts than C; only if C's DERP route misbehaves. |
| Direct inbound to claw | **No**: campus NAT (`10.3.x`), no IPv6 | — | |
| Pick a closer Funnel ingress | **No**: not configurable | — | |

Option C still uses Tailscale, but replaces *Tailscale's* ingress in Japan with ours in India. The
Worker becomes optional: DNS can point straight at the VPS (Caddy does TLS), or stay proxied
through Cloudflare for caching (adds one BOM hop, a few ms).

Independent of the network: clicks that refetch an RSC payload pay the full ~400 ms each time.
Client-side reuse (`experimental.staleTimes`, the board skeleton from `3ffce6b`) hides part of it
until the path is fixed.

## 6. Experiments (2026-10-26)

All run on claw with `cloudflared 2026.10.3` in `~/bin`. The tunnel probes used a **fake token**,
so the edge could only refuse: no tunnel was registered and nothing was exposed.

| # | Probe | Result |
|---|---|---|
| B0 | Quick tunnel `--protocol quic --url http://127.0.0.1:18999` (run by the box owner) | `failed to request quick Tunnel: Post "https://api.trycloudflare.com/tunnel": … connection reset by peer`. Failed before any edge connection |
| B0a | TLS from claw by SNI: `api.trycloudflare.com`, `trycloudflare.com`, `region1.v2.argotunnel.com` | **reset** at handshake (curl rc 35, connect 10 ms) |
| B0b | Same Cloudflare IP `104.16.230.132`, neutral SNI | handshake OK (HTTP 530). So: **SNI filtering**, not IP blocking |
| B0c | `api.cloudflare.com`, `dash.cloudflare.com` | OK (301 / 403) |
| B1 | `--protocol quic run --token <fake>` (UDP 7844, edge `198.41.200.63`) | `failed to dial to edge with quic: timeout: no recent network activity`. **UDP 7844 dropped** |
| B2 | `--protocol http2 --edge 198.41.192.57:443 run --token <fake>` | `TLS handshake with edge error: … read: connection reset by peer` |
| B2a | `--protocol quic --edge 198.41.192.57:443` | QUIC timeout; cloudflared prints "Allow outbound QUIC traffic on port 7844 or use HTTP2" |
| B2b | curl with SNI `h2.cftunnel.com` / `quic.cftunnel.com` to `198.41.192.57:443` | handshake completes, cert mismatch (rc 60). Not SNI-reset, but cloudflared's own handshake on 443 is (B2) |

**Verdict:** Cloudflare Tunnel can't connect from this network by any transport. Skipping
Funnel needs our own ingress near the box (option C).

> **Superseded 2026-11-05: Tunnel works when WARP carries it.** See §6.1.

### 6.1 Cloudflare Tunnel inside WARP (2026-11-05)

WARP (MASQUE) works on campus: claw already runs it in `doh` mode for box DNS, and the Mac
(`10.3.59.190`) runs it in full mode. The test switched claw's WARP to `warp+doh` for about 25 s
(with a 10-min auto-revert), then ran `cloudflared 2026.10.3` with a **fake token**.

| # | Probe | Result |
|---|---|---|
| W0 | Mac via WARP → `198.41.192.57:7844`, `198.41.200.63:7844` | TCP **open**. TLS with SNI `region1.v2.argotunnel.com` **completes** (rc 60 cert mismatch, not a reset) |
| W1 | claw `warp+doh`: route to `198.41.192.57` | `dev CloudflareWARP`; egress colo **HYD** |
| W2 | claw `warp+doh`: DNS, Tailscale | DNS OK. The tailnet stayed up, and the Mac's direct LAN path held (10.0.0.0/8 and 100.64.0.0/10 are excluded from WARP) |
| W3 | `--protocol http2 run --token <fake>` | Edge answered: `Register tunnel error from server side error="Failed to get tunnel"` (an auth rejection, not a timeout or reset) |
| W4 | `--protocol quic run --token <fake>` | Same: `Failed to get tunnel` from `198.41.192.67`. **QUIC works too** |

**Verdict:** both transports reach the tunnel edge and get as far as registration once WARP
carries them. The campus port block and SNI DPI are bypassed. Next: a split-tunnel (Include only
the tunnel edge IPs) so that WARP carries only cloudflared, then a real tunnel on a test hostname.
Afterwards claw went back to `doh` mode (verified), with no `cloudflared` running.

### 6.2 Real tunnel on a test hostname (2026-11-05)

Setup:
- **WARP:** claw is enrolled in Zero Trust team `srm2k29` with service token `claw-warp`. Its
  device profile `claw (cloudflared carrier)` uses MASQUE, with Split Tunnels in **Include** mode:
  `198.41.192.0/24`, `198.41.200.0/24` and the v6 /48s. All other traffic leaves through the
  campus link (`warp=off`, colo MAA). DNS still works on the host and in containers, and the
  tailnet is unaffected.
- **Tunnel:** tunnel `claw` (`18415fe3…`) runs as the user service `cloudflared-claw`
  (`--protocol http2`; QUIC fails inside ZT MASQUE). It has 3 connections, at **bom03, bom09 and bom11**.
- **Hostname:** `next.fc-os.tech` → `http://localhost:80` with `Host: fc-os.tech`, so Traefik
  routes it with no shim and no Coolify change.
- **WARP leg:** `tunnel stats` reports MASQUE over HTTPS/TCP to colo MAA, ~8 ms. TCP connect
  from claw to the tunnel edge through WARP takes 28 ms.

Two gotchas during enrollment:
- When `mdm.xml` appears, WARP deletes the old registration first, and that takes down its DNS
  proxy. Enrollment then can't resolve `srm2k29.cloudflareaccess.com`. Fix: pin it and
  `zero-trust-client.cloudflareclient.com` in `/etc/hosts` (marker `fcos-warp-zt`).
- A new ZT profile defaults to **WireGuard**, which campus blocks ("Failed to perform happy
  eyeballs"). Fix: set the profile's `tunnel_protocol` to `masque`, then restart `warp-svc`.

`/login` TTFB, 20 runs each:

| Client | Tunnel (`next.fc-os.tech`) | Current (`fc-os.tech`, Worker + Funnel) |
|---|---|---|
| Mac on campus, **WARP off** | median **0.51 s**, p90 0.73, max 1.25; 1 of 20 over 1 s | median 1.26 s, p90 2.12, max 3.06; **10 of 20 over 1.8 s** |
| Mac, WARP on | median 0.27 s, p90 0.37, max 0.44 | median 0.60 s, p90 0.85, max 1.46 |
| claw → edge → claw (10 runs) | 0.24–0.55 s, plus one 1.2 s outlier with slow TCP and TLS | 0.38–2.04 s, half of the runs 1.4–2.0 s |

The tunnel removes the Funnel/DERP slow mode, which was the 1.5–3 s tail. The remaining gap is
**edge colo**: campus clients and claw both reach `fc-os.tech` and `next.fc-os.tech` at **SIN**
(6 of 6 `cf-ray`s), while the tunnel is registered at BOM. So each request goes campus → SIN →
BOM → (WARP) MAA → claw. The request leg after TLS is ~250–330 ms, against ~35 ms for
claw ↔ tunnel edge plus the app. Free-plan zones in India are often served from SIN. Ways to
close the gap: Argo Smart Routing (edge ↔ tunnel path), or a plan that gets Indian colos.

Cleanup verified: no `cloudflared` or test `http.server` running; `/tmp/cf-exp.log` remains
(3 lines). The binary stays in `~/bin` (unused, no service).

### Still pending

- Authenticated server timing on the Coolify stack (session cookie from the account owner,
  read-only GETs) for `/dashboard`, `/dashboard/opus`, two boards.
- ~~Client rows with WARP off~~: done, §3.3.

## 7. Method and limitations

- All HTTP probes were read-only GETs; nothing was written to prod. Tunnel probes used a fake
  token (§6); the one real quick-tunnel attempt never got a URL.
- Client: macOS on WARP (see caveat). Box: `ssh aio`.
- Small samples (6–10 runs); the box loop in particular is jittery — rerun before deciding.

### 6.3 Cutover (2026-11-06 07:00 IST)

`fc-os.tech` and `www` now point **directly at tunnel `claw`**: proxied CNAMEs, no Worker, no
Caddy shim. The Worker's Custom Domains were detached (the Worker stays deployed, unbound, as the
rollback). The Funnel stays on, but `fcos-funnel-guard.timer` is disabled.
`fcos-tunnel-guard.timer` replaces it.

| Check | Result |
|---|---|
| `/login`, `/`, `www` | 200; `cf-ray` BOM; no `X-Edge-Cache` header (no Worker) |
| `/_next/static/*.js` | `cache-control: immutable`, `cf-cache-status` MISS → HIT (default cache; no Worker needed) |
| `/api/realtime` signed out / `/api/auth/get-session` | 401 / 200 |
| `fc-os.tech/login` ×20, Mac WARP on | median **0.20 s**, p90 0.27, max 0.30 (before: 0.60 / 0.85 / 1.46) |
| Drill: stop `cloudflared` | 530 at once; the guard restarted it within one run, then 200 |
| Reboot at 00:00 (unplanned, overnight) | WARP re-enrolled on its own (team, MASQUE) and the tunnel came back with 4 connections |

Not measured after cutover: a campus WARP-off run (toggling WARP on the Mac knocked its Tailscale
client offline; see §6.2 for the WARP-off comparison on the same tunnel).
