# FC OS — Production Runbook (self-hosted)

Operational source of truth for the **live** self-hosted deployment. For the original
step-by-step bring-up see `deploying-self-hosted.md`; for the planned dual-mode failback
see `future-architecture.md`.

## Topology

Single home server **`claw`** (CachyOS / Arch), reached via `ssh aio` (key auth; **fish**
login shell). Two checkouts under `~/hosting/`, both behind one Cloudflare tunnel:

| Role | Dir | Branch | pm2 | Port | Public host |
|---|---|---|---|---|---|
| **Primary prod** | `fc-os-web-local` | `feat/local-self-hosting` | `fc-os-local` | 3005 | **fc-os.tech**, www.fc-os.tech |
| **Standby** | `FC-OS-Web` | `main` (Neon) | `fc-os` | 3000 | cloud.fc-os.tech |

`local.fc-os.tech` → :3005 is a harmless alias of primary.

## Primary stack (fc-os.tech)

- **DB** — local Supabase Postgres `127.0.0.1:54322`, `postgres-js` driver (`src/database/db.ts`).
  Brought up by `supabase start`; containers auto-restart with Docker.
- **Auth** — self-hosted Better Auth (`src/lib/auth/server.ts`): passwordless OTP, uuid ids,
  tables `user/session/account/verification` in `public`. `BETTER_AUTH_URL=https://fc-os.tech`,
  `trustedOrigins` = apex + www.
- **Mail** — Resend over SMTP (`smtp.resend.com:465`), sender `no-reply@fc-os.tech`
  (domain verified). API key lives only in `.env` (`SMTP_PASS`).
- **Process** — pm2; persisted via `pm2 save` + `pm2-opdhaker.service` (both apps in the dump).
- **Public** — cloudflared tunnel `201ebd07-…`, config at **`/etc/cloudflared/config.yml`**
  (root-owned — *not* `~/.cloudflared/config.yml`, which is an ignored stray). DNS in Cloudflare.
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

**Roll back the apex** (serve Neon again) → restore a `/etc/cloudflared/config.yml.bak.*` then
`ssh -t aio sudo systemctl restart cloudflared` (~30s).

**After reboot / power loss** → Supabase containers + both pm2 apps auto-recover. Verify
`pm2 ls` + `curl -I https://fc-os.tech`. If Supabase is down: `cd ~/hosting/fc-os-web-local &&
supabase start`, then re-run `redeploy.sh`. The `fcos-firewall` rule re-applies on boot.

## Secrets

All in gitignored `.env` files — primary: `DATABASE_URL` (local PG), `BETTER_AUTH_SECRET`,
`SMTP_PASS` (Resend key); standby `FC-OS-Web/.env`: Neon `DATABASE_URL` + Neon Auth creds.
cloudflared tunnel cert/creds under `/etc/cloudflared/`. Never commit any of these.

## Gotchas

- **fish login shell** — wrap bash-syntax remote commands: `ssh aio 'bash -s' <<'EOF' … EOF`.
- **cloudflared config** is `/etc/cloudflared/config.yml` (root); the service runs `--config` on it.
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

- **Box reliability** — home WiFi + mains power (rebooted twice + a power cut during setup).
  Wire ethernet; `cloud.fc-os.tech` is the failback.
- **`permissions` table empty** — matches Neon prod, so RBAC is flag/role-based, not row-based.
- **Reverse sync (local → Neon) not built** — and a one-off app-data push can't carry Better
  Auth identities into Neon Auth. The clean fix is the dual-mode design in `future-architecture.md`.

## Health checklist

- `pm2 ls` → `fc-os` + `fc-os-local` online.
- `curl -I https://fc-os.tech` (primary) + `https://cloud.fc-os.tech` (standby) → 200.
- `systemctl is-active cloudflared fcos-firewall` → active.
- `supabase status` healthy; Postgres bound to `127.0.0.1` and **not** reachable from the LAN
  (`nc -vz <lan-ip> 54322` from another WiFi device should refuse).
- OTP login on fc-os.tech delivers a real email (Resend dashboard → Emails shows delivered).
