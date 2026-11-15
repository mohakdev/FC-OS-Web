# FC OS — self-host performance report

> **Snapshot (2026-07-13).** Measured on the pre-Coolify setup (pm2 + a Supabase Docker
> stack). Production has since moved to a Coolify Dockerfile app + Coolify Postgres 17, so
> the pm2 and Supabase recommendations below no longer apply. Figures are kept for history.

**Date:** 2026-07-13 · **Host:** `claw` (AIO box) · **Target:** `fc-os-web-local` @ `:3005` (serves **fc-os.tech**)
**Deployed commit:** `408c21c` · **Build:** Next.js 16.2.6, Bun, pm2 fork mode

Every number below was measured on the live box unless explicitly marked **(derived)**.
Load was generated on-box against `127.0.0.1:3005`, bypassing the Cloudflare tunnel, so
these figures describe the *application's* capacity, not the network path to it.

---

## 1. The headline

FC OS serves its heaviest page in **~13 ms** and saturates at **~90 requests/second** —
while using **one CPU core out of twelve**. The database, at full application load, was
working at **one third of a single core**.

For a club of ~22 members, the box is running the app at roughly **1/10th of the hardware
it has available**, and the hardware itself is a 6-core desktop CPU that cost a fraction of
a year of managed hosting. There is no capacity problem here. There is a *configuration*
ceiling, and it is one line of config wide (§5).

---

## 2. Hardware and idle state

| | |
|---|---|
| CPU | Intel i5-10500 — 6 cores / 12 threads, 3.1 GHz base, 4.5 GHz boost |
| RAM | 14 GiB (7.6 GiB free, 4.4 GiB cache) |
| Disk | 950 GB NVMe, **4% used** |
| Load average (idle) | **0.21** over 2h37m uptime |
| Edge | `cloudflared` tunnel — no nginx, no Caddy |

App process at idle: **229 MB RSS**, zero pm2 restarts.
Second pm2 process (`fc-os`, the Neon standby on `:3000`) idles at 121 MB.

---

## 3. Latency — warm, authenticated, real data

Measured with a real member session cookie against real production rows.
`TTFB` = time to first byte; `bytes` = fully rendered HTML.

| Route | TTFB | HTML size |
|---|---|---|
| `/login` | **1.1 ms** | 18 KB |
| `/dashboard` | **14.2 ms** | 59 KB |
| `/dashboard/opus` | **14.3 ms** | 99 KB |
| `/dashboard/opus/tasks/technical` (kanban board) | **13.4 ms** | 106 KB |
| `/dashboard/opus/manage/technical` | **19.6 ms** | 122 KB |
| `/dashboard/member-directory` | **20.2 ms** | 198 KB |
| `/dashboard/settings/roles` (RBAC grid) | **13.0 ms** | 158 KB |
| `/dashboard/profile` | **11.7 ms** | 63 KB |

Every route is `force-dynamic` — these are **full server renders with live database
queries on every request**, not cached HTML. Nothing here is above 20 ms.

---

## 4. Throughput — the saturation curve

Ramp against the Opus kanban board (`/dashboard/opus/tasks/technical`), the heaviest
realistic page. 10 s per step.

| Concurrency | Req/sec | p50 | p90 | p99 | max | errors |
|---|---|---|---|---|---|---|
| 1 | 70.7 | 13 ms | 15 ms | 19 ms | 25 ms | 0 |
| 2 | 86.0 | 23 ms | 25 ms | 28 ms | 45 ms | 0 |
| 4 | 89.2 | 44 ms | 50 ms | 59 ms | 75 ms | 0 |
| **8** | **90.2** | 88 ms | 97 ms | 105 ms | 115 ms | 0 |
| 16 | 89.0 | 177 ms | 191 ms | 206 ms | 211 ms | 0 |
| 32 | 86.3 | 360 ms | 391 ms | 428 ms | 459 ms | 0 |
| 64 | 84.3 | 732 ms | 766 ms | 1072 ms | 1162 ms | 0 |
| 128 | 78.3 | 1493 ms | 1598 ms | 2218 ms | 2277 ms | 0 |

Two things worth stating plainly:

- **Throughput plateaus at ~90 rps from concurrency 8 onward** and stays flat. Beyond that
  point, extra concurrency buys nothing and simply queues — latency grows linearly, exactly
  as a single saturated resource predicts.
- **Zero errors, zero timeouts, zero non-2xx at any level, including 128 concurrent.** It
  degrades by getting slower, not by falling over. Under 6× its saturation point it was
  still serving every single request correctly.

The lighter `/dashboard` route sustained **155 rps** under the same conditions.

### What the bottleneck actually is

Sampled mid-load (concurrency 16, instantaneous, not lifetime average):

```
next-server (pid 824)   109.4% CPU     ← one full core, pegged
supabase_db postgres     32.5% CPU     ← one third of one core
                                          11 of 12 threads idle
```

The application is **CPU-bound on a single Node process**. Postgres is not close to being
the limit — at the app's absolute throughput ceiling, the database was a third of a core
busy. App RSS peaked at **581 MB** under sustained load (up from 229 MB idle; GC headroom,
returned to ~384 MB after).

---

## 5. The one real finding: pm2 is in `fork` mode

```
│ 1  │ fc-os-local │ fork │ online │ 0 restarts │
```

`fork` mode runs **a single Node process**, which is single-threaded. That is the entire
explanation for the 90 rps plateau: the app can only ever use **1 of the box's 12 threads**,
no matter how much load arrives.

The box has 6 physical cores. Postgres needs ~0.33 of one at full app load. **(derived)**
Running the app in cluster mode across ~6 instances should therefore recover most of the
idle capacity — the CPU is provably there and provably unused. I did not get to measure
multi-instance throughput directly (starting a second instance required exporting secrets
and was blocked), so treat the multiplier as *expected*, not *measured*. What **is**
measured is that 11 threads sat idle while the app was pegged.

This is the single highest-leverage change available, and it is configuration, not code.

---

## 6. Realtime (LISTEN/NOTIFY → SSE) — genuinely cheap

The architecture holds up well under measurement. One Postgres `LISTEN` per Node process
(not per client), fanned out to an in-memory `Set` of SSE subscribers.

**Held 200 concurrent authenticated SSE connections:**

| | |
|---|---|
| Connections established | **202 / 202** |
| App memory growth | **~0 KB** (−8 KB, i.e. noise) |
| App CPU while holding them | **0.0%** |
| Page TTFB *while* 200 connections were held | **11.5 ms** (unchanged from idle) |

**Fired one `pg_notify` on `fc_realtime` with 200 clients attached:**

| | |
|---|---|
| Clients that received the event | **200 / 200** |
| App CPU immediately after fan-out | **0.0%** |

Idle realtime connections are effectively free, and the notify fan-out itself costs nothing
measurable. The SSE endpoint is correctly auth-gated (`401` without a session).

### The honest caveat

The *server-side* fan-out is free. The **client reaction is not**: each connected browser
responds to an event by calling `router.refresh()`, which is a full RSC re-render on the
server. So one task update with N users online costs **N renders**, not one.

**(derived, from the measured 90 rps ceiling):** with 200 users on a board, a single
mutation queues ~200 renders ≈ **2.2 seconds** of single-core work to drain. At today's 22
members it is ~0.25 s and invisible. This is the thing that will bite first as the club
grows — and note that cluster mode (§5) divides this cost directly.

---

## 7. Data scale (for honesty about what was benchmarked)

| Table | Rows |
|---|---|
| users / profiles | 22 / 22 |
| opus_tasks | 29 |
| sessions | 44 |
| role_permissions | 36 |
| **Database size** | **12 MB** |

These latencies are on a small dataset. The Opus board renders 29 tasks, not 29,000 — page
cost will grow with task count. Postgres connections: **38 of 100** in use at idle, which is
worth watching, because cluster mode multiplies pool count by instance count (§5).

---

## 8. So how many concurrent users?

Stating this carefully, because it depends entirely on what "concurrent" means.

- **Concurrently connected (idle, realtime attached):** measured at **200 with zero cost**.
  Nothing suggests that is the ceiling; memory and CPU didn't move. The real limit is file
  descriptors and RAM, and neither was touched.
- **Concurrently *reading* pages:** at **8 simultaneous in-flight requests**, everyone gets
  sub-100 ms responses. At 32, everyone still gets sub-500 ms, which is fine.
- **Active users, in the human sense (derived):** a member reading a kanban board loads a
  page every ~20–30 s of use. At 90 rps that is a theoretical ~2,000+ such users. That number
  is arithmetic, not a measurement — I do not stand behind it as a promise, and realtime
  fan-out (§6), not page loads, is what would actually break first.

**What I will stand behind:** the club is 22 people. The app answers in 13 ms, saturates at
90 rps, and does so using **8% of the machine**. FC OS is not close to any limit that
matters, on hardware that is sitting at a load average of 0.21.

---

## 9. Efficiency note: the Supabase stack is mostly dead weight

The local Postgres runs as a full Supabase Docker stack — **10 containers, ~2.0 GB RAM**.
Postgres itself is only **215 MB** of that. The rest:

| Container | RAM | Does FC OS use it? |
|---|---|---|
| `logflare` (analytics) | 670 MB | No |
| `realtime` | 288 MB | **No** — app rolls its own LISTEN/NOTIFY |
| `studio` | 233 MB | Dev convenience only |
| `storage-api` | 185 MB | No |
| `vector` | 154 MB | No |
| `kong` (gateway) | 148 MB | No |
| `postgres-meta` | 100 MB | No |
| `postgrest` | 34 MB | No — app uses `postgres-js` directly |

The app talks to Postgres directly and implements its own realtime. **~1.8 GB is being
spent on services FC OS never calls.** RAM is not currently scarce (7.6 GiB free), so this
is not urgent — but if you ever want the headroom, it is sitting right there.

---

## 10. Recommendations, in order

1. **Switch pm2 to cluster mode** (~6 instances). Biggest win available; the idle CPU is
   measured, not theoretical. Verify the Postgres pool size afterward — 38/100 connections
   are already held at idle, and cluster mode multiplies that.
2. **Watch realtime fan-out as the club grows.** It is free today and stays free while the
   member count is small; it is the first thing that will hurt at scale. Cluster mode
   mitigates it directly.
3. **Trim the Supabase stack** to just Postgres if you want ~1.8 GB back. Low priority.
4. Nothing else. The latency, the error behavior under 6× overload, and the realtime design
   all held up under measurement.

---

## Appendix — method and limitations

- Load generated with `autocannon` on-box against `127.0.0.1:3005`. The Cloudflare tunnel
  path was **not** benchmarked, so real end-user latency = these numbers + tunnel RTT.
- Authenticated benchmarks used a **real session cookie supplied by the account owner**
  (`od7270@srmist.edu.in`), not a forged one. All benchmark requests were **read-only GETs**;
  no application data was written.
- One `pg_notify` was fired on `fc_realtime` to measure fan-out. It carries no row data and
  changes nothing — connected browsers would have performed a redundant refresh.
- Cleanup completed: temporary session row deleted, cookie file and all benchmark scripts
  removed from the box.
- **The session cookie used is in this session's transcript.** Log out of fc-os.tech once to
  rotate it.
- Not measured: multi-instance/cluster throughput, tunnel-path latency, behavior at larger
  data volumes, write/mutation throughput.
