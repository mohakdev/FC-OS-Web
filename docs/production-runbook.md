# FC OS — Production Runbook (self-hosted)

Operational source of truth for the **live** self-hosted deployment. For the original
step-by-step bring-up see `deploying-self-hosted.md`; **how the site is exposed to the
public internet** (Tailscale Funnel + Cloudflare Worker + edge caching) lives in
`SELF_HOSTING.md`; for the planned dual-mode failback see `future-architecture.md`.

## Topology

Single server **`claw`** (CachyOS / Arch), reached via `ssh aio` over Tailscale (key auth;
**fish** login shell). One app checkout under `~/hosting/`:

| Role | Dir | Branch | pm2 | Port | Public host |
|---|---|---|---|---|---|
| **Prod** | `fc-os-web-local` | `feat/local-self-hosting` | `fc-os-local` | 3005 | **fc-os.tech**, www.fc-os.tech |

The public path is **not** cloudflared. The box runs on restrictive SRMIST dorm Wi-Fi
(all UDP blocked, TCP 7844 blocked — only 443 egresses), so cloudflared can't connect.
Instead: **Tailscale Funnel** (`:443 → localhost:3005`) fronted by a **Cloudflare Worker**
(`fc-os-proxy`) that fixes SNI and edge-caches static assets. Full detail + the Worker
source: `SELF_HOSTING.md` / `workers/fc-os-proxy.js`.

> The old Neon standby (`cloud.fc-os.tech`, pm2 `fc-os` on :3000) and its checkout were
> **removed** — there is one app now. Failback is the design in `future-architecture.md`,
> not a running second instance.

## Primary stack (fc-os.tech)

- **DB** — local Supabase Postgres `127.0.0.1:54322`, `postgres-js` driver (`src/database/db.ts`).
  Brought up by `supabase start`; containers auto-restart with Docker.
- **Auth** — self-hosted Better Auth (`src/lib/auth/server.ts`): passwordless OTP, uuid ids,
  tables `user/session/account/verification` in `public`. `BETTER_AUTH_URL=https://fc-os.tech`,
  `trustedOrigins` = apex + www.
- **Mail** — Resend over SMTP (`smtp.resend.com:465`), sender `no-reply@fc-os.tech`
  (domain verified). API key lives only in `.env` (`SMTP_PASS`).
- **Process** — pm2; persisted via `pm2 save` + `pm2-opdhaker.service`.
- **Public** — Tailscale Funnel `:443 → localhost:3005` (`tailscale funnel status` to check),
  fronted by Cloudflare Worker `fc-os-proxy` (SNI fix + static edge cache; deploy with
  `npx wrangler deploy -c workers/wrangler.jsonc`). `fc-os.tech` is a **Custom Domain** on
  that Worker. cloudflared is defunct on this network (7844 blocked) and left disabled — see
  `SELF_HOSTING.md`.
- **Firewall** — `fcos-firewall.service` runs `/usr/local/bin/fcos-firewall.sh`, a `DOCKER-USER`
  rule dropping tcp `54320:54330` on `wlan0`+`eno1` (Docker publishes Supabase on 0.0.0.0 and
  bypasses ufw). Loopback + tailscale unaffected.

## Ops scripts (`scripts/`)

- **`redeploy.sh`** — pull → `bun install` → build → clean pm2 restart → health-check.
  Run: `ssh aio bash hosting/fc-os-web-local/scripts/redeploy.sh`
- **`sync-neon-to-local.sh`** — full one-way data mirror Neon → local: safety-backup,
  dump Neon (aborts if empty), atomic truncate+reload, upsert auth users from `neon_auth.user`,
  verify. Run: `ssh aio bash hosting/fc-os-web-local/scripts/sync-neon-to-local.sh`
- **`dev.sh`** — local dev on a Mac: ensures Supabase is up, runs `bun run dev` on :3000.
- **`backup-to-github.sh`** — encrypted DB backup → private GitHub repo (see **Backups** below).
  Standalone/non-agentic; runs nightly via the `fcos-backup` systemd timer.
  Run: `ssh aio bash hosting/fc-os-web-local/scripts/backup-to-github.sh`

## Local dev (Mac)

A throwaway local copy of the self-hosted stack for UI/UX work + debugging — never touches
prod (`fc-os.tech`).

- **Prereqs**: a container runtime (**OrbStack** — `brew install orbstack`, launch once to
  finish first-run setup) and the Supabase CLI. `bun install` for deps.
- **DB / mail / app**: local Supabase Postgres `127.0.0.1:54322`, **Mailpit** OTP inbox at
  `http://localhost:54324` (no real sends), app at `http://localhost:3000`.
- **`.env` (dev)**: `DATABASE_URL` → local Supabase, `BETTER_AUTH_URL=http://localhost:3000`,
  and `SMTP_*` pointed at Mailpit (`127.0.0.1:54325`, `SMTP_SECURE=false`, empty user/pass).
- **Mailpit toggle**: local dev needs `[inbucket] enabled = true` in `supabase/config.toml`.
  Prod keeps it `false`, so **leave that edit uncommitted** (it shows as a local `M`).
- **Run**: `bash scripts/dev.sh` → log in with any real member email, read the OTP at
  `http://localhost:54324`. Stop with `supabase stop` (+ kill the dev process).
- **Seed dev data from prod** (into empty tables; truncate first if not empty):
  ```bash
  { echo "SET session_replication_role=replica;"; ssh aio 'bash -s' <<'EOF'
  pg_dump "postgres://postgres:postgres@127.0.0.1:54322/postgres" --data-only --schema=public \
    --no-owner --no-privileges --column-inserts -T session -T account -T verification 2>/dev/null
  EOF
  } | docker exec -i supabase_db_fc-os-web psql -U postgres -d postgres
  ```
  (excludes `session/account/verification`; keeps `user` so the same logins work locally.)

## Routine procedures

**Ship a code / UI change** → push to `feat/local-self-hosting`, then run `redeploy.sh`.

**Refresh data from Neon** → run `sync-neon-to-local.sh` (Neon is treated as source of truth).

**Edit `.env`** → rebuild + **clean** restart (`pm2 delete fc-os-local && pm2 start …`), never a
soft `pm2 restart` — pm2 reuses the cached process env and `dotenv` won't override an edited value
(this caused a Resend `535 EAUTH`). `redeploy.sh` already does the clean restart.

**Public path down but app up (`localhost:3005` ok, `fc-os.tech` not)** → `fcos-funnel-guard`
should already be fixing it; check `journalctl -u fcos-funnel-guard -n 50`, or force a run with
`sudo systemctl start fcos-funnel-guard.service`. **A 525 means the funnel ingress, not the
app** — see the 525 section in `SELF_HOSTING.md` (and note that `curl https://claw.tail3b56f7.ts.net`
from a tailnet device is a false green: MagicDNS short-circuits it to the tailnet IP).
Manual re-arm: `sudo tailscale funnel --https=443 off && sudo tailscale funnel --bg --https=443 http://localhost:3005`.

**After reboot / power loss** → nothing to do by hand. Supabase containers + the pm2 app
auto-recover, the box re-joins SRMIST + re-auths the captive portal, the `fcos-firewall` rule
re-applies, `fcos-funnel-guard.service` re-arms the Funnel once the network is really up
(then re-checks every 5 min via `fcos-funnel-guard.timer`), and `fcos-supabase-guard.service`
re-applies `unless-stopped` to every Supabase container and starts anything that stayed down.
Verify with `curl -I https://fc-os.tech` → 200/307. If Supabase is down:
`cd ~/hosting/fc-os-web-local && supabase start`, then re-run `redeploy.sh`.

**⚠️ `supabase start` can take the prod DB down.** If the edge runtime is enabled, its boot
failure is fatal to the *whole* command — the CLI prints `main worker boot error`, then
`Stopping containers...`, and you are left with **no database**. That is why
`[edge_runtime] enabled = false` in `supabase/config.toml`. Recovery if it happens: disable
edge_runtime, `supabase start` again, verify with
`docker exec supabase_db_fc-os-web pg_isready -U postgres`. Data survives (it lives in the
docker volume), and `neon-app-data*.sql` / the nightly backups are the fallback.

**Edge functions don't run on this network.** The CLI's generated main worker imports
`https://deno.land/std/...` at boot and **deno.land is blocked on SRMIST** — campus DNS
answers with an AAAA only (`2602:f70f::1`), the box has no IPv6, and the IPv4 address
(`69.67.170.170`) is unreachable too. Verified from both the box and a laptop. This is why
the container had been dead since 2026-06-25. To actually use functions: run them on a
network that can reach deno.land, or proxy deno.land through the Cloudflare Worker and
point an import map at it. `fcos-supabase-guard` treats an absent edge container as normal.

**Supabase container down** → `fcos-supabase-guard` re-applies `unless-stopped` (the CLI
keeps resetting it) and starts anything stopped; force a run with
`sudo systemctl start fcos-supabase-guard.service`, read `journalctl -u fcos-supabase-guard -n 50`.

## Secrets

All in gitignored `.env` files — `DATABASE_URL` (local PG), `BETTER_AUTH_SECRET`,
`SMTP_PASS` (Resend key). The Cloudflare Worker deploy uses `wrangler`'s own OAuth login
(no token in the repo). Never commit any of these.

## Gotchas

- **fish login shell** — wrap bash-syntax remote commands: `ssh aio 'bash -s' <<'EOF' … EOF`.
- **git on the box uses SSH-over-443** (`~/.ssh/config`: `github.com → ssh.github.com:443`) —
  SRMIST blocks port 22. Same trick from the Mac: `GIT_SSH_COMMAND='ssh -o HostName=ssh.github.com -p 443' git push`.
- **cloudflared is defunct** on SRMIST (7844 blocked); ignore its `activating` state or disable it.
- **sudo needs a password** (no NOPASSWD) → use `ssh -t aio sudo …` for interactive prompt.
- **pm2 + dotenv** stale-env after `.env` edits → clean delete+start, not soft restart.
- **Supabase CLI binds 0.0.0.0** with default `postgres/postgres` creds → mitigated by the firewall.
- SSH config auto-forwards `:3001` → the harmless `Address already in use` warning on every command.

## Backups

Nightly encrypted offsite backup of the primary DB to a **private GitHub repo** (free storage).
Runs via `scripts/backup-to-github.sh` — standalone shell (pg_dump | gzip | age | git), no AI at
runtime. `pg_dump` of `127.0.0.1:54322` → gzip → **age-encrypted** → committed+pushed over a
dedicated SSH deploy key. GitHub only ever sees ciphertext. Working dir keeps the newest `KEEP`
(30) blobs; git history retains all.

- **Config (Box-only, not committed)**: `~/.config/fcos-backup/backup.env` sets
  `BACKUP_REPO_DIR`, `AGE_RECIPIENT` (age public key), optional `KEEP`/`LOCAL_URL`/`SSH_KEY`.
- **Schedule**: user units `scripts/systemd/fcos-backup.{service,timer}` → `~/.config/systemd/user/`,
  `systemctl --user enable --now fcos-backup.timer` (+ `loginctl enable-linger opdhaker`). Fires
  03:00 daily, `Persistent=true` so a run missed during downtime fires on next boot.
- **Status**: `systemctl --user list-timers | grep fcos-backup`;
  logs `journalctl --user -u fcos-backup`.

### One-time setup (run once on the box)

1. **age key** — `mkdir -p ~/.config/fcos-backup && age-keygen -o ~/.config/fcos-backup/age.key
   && chmod 600 ~/.config/fcos-backup/age.key`. Put the printed **public key** in `backup.env`
   as `AGE_RECIPIENT`. ⚠️ **Back up the private key `age.key` off-box (password manager). Without
   it every backup is unrecoverable.**
2. **SSH deploy key** — `ssh-keygen -t ed25519 -f ~/.ssh/fcos-backup -N ''`; add `~/.ssh/fcos-backup.pub`
   as a **write** deploy key on a new **private** repo `fc-os-db-backups`.
3. **Clone** it: `git clone git@github.com:<you>/fc-os-db-backups.git ~/hosting/fc-os-db-backups`
   (the script pins the key via `GIT_SSH_COMMAND`, so no `~/.ssh/config` alias needed).
4. Write `~/.config/fcos-backup/backup.env` (`BACKUP_REPO_DIR=$HOME/hosting/fc-os-db-backups`, the
   `AGE_RECIPIENT`), then `bash scripts/backup-to-github.sh` once to verify.
5. If `age` is missing: `sudo pacman -S age`.

### Restore

```bash
age -d -i ~/.config/fcos-backup/age.key db-<TS>.sql.gz.age | gunzip | psql "$LOCAL_URL"
```

(`LOCAL_URL` = `postgres://postgres:postgres@127.0.0.1:54322/postgres`. Restore into a scratch DB
first to verify before touching prod.)

## Known gaps / TODO

- **Single point of failure** — one box, one app, dorm Wi-Fi + mains power (rebooted twice + a
  power cut during setup). No live failback anymore (the Neon standby was removed). The public
  path also depends on the Tailscale DERP relay while UDP is blocked. Wiring ethernet / moving to
  a UDP-open network would let cloudflared work directly again and drop the relay.
- **Reverse sync (local → Neon) not built** — and a one-off app-data push can't carry Better
  Auth identities into Neon Auth. The clean fix is the dual-mode design in `future-architecture.md`.
- **Any future Neon promotion needs the RBAC seed first** — a fresh/parallel DB needs the
  `role_permissions` composite PK + `bun run seed` (see below) *before* the app serves traffic,
  or every permission check returns false for everyone.

### RBAC / permissions (done 2026-07-13)

`permissions` + `role_permissions` are now live and are the authorization model — see
`docs/architecture.md` `### RBAC`. Two things to know operationally:

- **Seed before you deploy.** Code that reads an *empty* `role_permissions` denies
  everything to everyone, including `role.manage` — a total org lockout recoverable only by
  SSH. On any new DB: apply the composite PK, then `bun run seed` (idempotent), *then*
  build/restart.
- **Break-glass.** `president × role.manage` and `president × member.manage` are protected
  in code (`src/lib/auth/catalog.ts`) and cannot be revoked through the grid, so an approved
  president can always get back in. If the grid is ever wrecked anyway, `bun run seed`
  restores the baseline (it only ever adds rows — `onConflictDoNothing`; clear
  `role_permissions` first if you need a true reset).

## Health checklist

- `pm2 ls` → `fc-os-local` online.
- `curl -I https://fc-os.tech` → 200/307; `tailscale funnel status` → funnel on, `→ :3005`.
- Static edge cache working: `curl -sI https://fc-os.tech/favicon.ico | grep -i x-edge-cache`
  twice → `MISS` then `HIT` (see `SELF_HOSTING.md`).
- `systemctl is-active fcos-firewall` → active. (cloudflared is defunct here — ignore it.)
- `supabase status` healthy; Postgres bound to `127.0.0.1` and **not** reachable from the LAN
  (`nc -vz <lan-ip> 54322` from another WiFi device should refuse).
- OTP login on fc-os.tech delivers a real email (Resend dashboard → Emails shows delivered).
