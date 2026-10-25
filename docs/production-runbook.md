# FC OS — Production Runbook

Live deployment on box **`claw`** (Ubuntu 26.04, Coolify 4.5). `ssh aio` →
`claw.tail3b56f7.ts.net` (100.117.43.58). Public path + deploy: `SELF_HOSTING.md`.

## Stack

| Piece | Where |
|---|---|
| App | Coolify app (Dockerfile), branch `feat/local-self-hosting`, domains `http://fc-os.tech,http://www.fc-os.tech` |
| DB | Coolify PostgreSQL 17 `fcos-db` (container `2gq6nkz3efzyniibkrffkpdp`), internal network only |
| Auth / mail | Self-hosted Better Auth (OTP); Resend SMTP `smtp.resend.com:465`, from `no-reply@fc-os.tech` |
| Shim | Caddy `/etc/caddy/Caddyfile` ← `scripts/caddy/Caddyfile`, `127.0.0.1:18080` |
| Funnel | `tailscale funnel --bg --https=443 http://127.0.0.1:18080` |
| Funnel guard | `/usr/local/sbin/fcos-funnel-guard.sh` + `fcos-funnel-guard.timer` (root) |
| Backups | `scripts/backup-to-github.sh` + user timers `fcos-backup{,-push}.timer` |
| Ops checkout | `~/fc-os-web` (scripts/units only, not served) |
| Prod DB access (Mac) | `bun run db:push:prod / db:sql:prod / db:seed:prod / db:studio:prod / db:psql:prod`; see `pushing-migrations.md` |

## Box-level settings (not in Coolify)

- **Docker DNS**: `/etc/docker/daemon.json` has `"bip": "10.0.0.1/24", "dns": ["10.0.0.1"]`, and
  `/etc/systemd/resolved.conf.d/docker-dns.conf` has `DNSStubListenerExtra=10.0.0.1`. The host DNS
  (WARP on 127.0.2.x) isn't reachable from containers, public resolvers are blocked, and the campus
  resolver drops AAAA queries. Without this, Coolify builds fail with "Could not resolve hostname".
- **Coolify proxy publishes no :443.** It was removed in Servers → localhost → Proxy, because
  tailscaled's serve binds `100.117.43.58:443` and Traefik's `0.0.0.0:443` would clash on every Docker restart.
- `box-firewall.service` drops new LAN connections to Docker-published ports. The tailnet and loopback are unaffected.
- sudo needs a password: `ssh -t aio 'sudo …'`.

## Secrets

Coolify env only: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `SMTP_PASS`. `BETTER_AUTH_SECRET` and the backup
`age.key` must also live in the owner's password manager (no `age.key` = no restore). Never commit secrets.

## Backups

Nightly at 03:00 IST: `docker exec <fcos-db> pg_dump` → gzip → `age` → push to private repo
`OPDhaker/fc-os-db-backups`. A catch-up push runs at 11:00 and 19:00. Each run fails loudly if
the offsite copy is more than 48h old.
- Config: `~/.config/fcos-backup/backup.env` (`BACKUP_REPO_DIR`, `AGE_RECIPIENT`, `DUMP_CONTAINER`).
  **If `fcos-db` is ever recreated, update `DUMP_CONTAINER`.**
- Status: `systemctl --user list-timers | grep fcos-backup`; log `~/.local/state/fcos-backup.log`.
- Restore (test into a scratch container first):
  ```bash
  age -d -i ~/.config/fcos-backup/age.key db-<TS>.sql.gz.age | gunzip \
    | docker exec -i <pg-container> psql -U postgres -d postgres
  ```

## RBAC

Permission checks read `role_permissions`; an empty table locks out everyone. On any new DB,
run `bun run seed` (idempotent) **before** serving traffic. `president × role.manage/member.manage`
can't be revoked through the UI (`src/lib/auth/catalog.ts`). See `docs/architecture.md` `### RBAC`.

## Health checklist

- `curl -I https://fc-os.tech` → 200; favicon `X-Edge-Cache` MISS then HIT.
- Coolify: app + `fcos-db` running (healthy).
- `systemctl is-active caddy`; `tailscale funnel status` → `/ proxy http://127.0.0.1:18080`.
- `systemctl list-timers fcos-funnel-guard.timer`; `systemctl --user list-timers | grep fcos-backup`.
- OTP email arrives (Resend dashboard → Emails).

## Known gaps

- Single box on dorm Wi-Fi and mains power; the only offsite copy is the GitHub backup.
- Failback design: `future-architecture.md`.
