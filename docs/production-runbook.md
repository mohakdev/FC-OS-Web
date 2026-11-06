# FC OS — Production Runbook

Live deployment on box **`claw`** (Ubuntu 26.04, Coolify 4.5). `ssh aio` →
`claw.tail3b56f7.ts.net` (100.117.43.58). Public path + deploy: `SELF_HOSTING.md`.

## Stack

| Piece | Where |
|---|---|
| App | Coolify app (Dockerfile), branch `feat/local-self-hosting`, domains `http://fc-os.tech,http://www.fc-os.tech` |
| DB | Coolify PostgreSQL 17 `fcos-db` (container `2gq6nkz3efzyniibkrffkpdp`), internal network only |
| Auth / mail | Self-hosted Better Auth (OTP); Resend SMTP `smtp.resend.com:465`, from `no-reply@fc-os.tech` |
| Public path | `fc-os.tech` + `www` = proxied CNAMEs → tunnel `claw` (`18415fe3-c233-4142-bc87-207db3f3bb23.cfargotunnel.com`), ingress `http://localhost:80` (Traefik) |
| Tunnel | user unit `cloudflared-claw` ← `scripts/systemd/cloudflared-claw.service`; token `~/.config/cloudflared/claw.token`; metrics `127.0.0.1:20241/ready` |
| WARP carrier | Zero Trust team `srm2k29`, enrolled by service token `claw-warp` (`/var/lib/cloudflare-warp/mdm.xml`); profile `claw (cloudflared carrier)`: MASQUE, Include split tunnel `198.41.192.0/24` + `198.41.200.0/24` only |
| Tunnel guard | `/usr/local/sbin/fcos-tunnel-guard.sh` + `fcos-tunnel-guard.timer` (root, every 5 min) |
| Standby (parked) | Worker `fc-os-proxy` (deployed, no domains) → Funnel `claw.tail3b56f7.ts.net` → Caddy shim `127.0.0.1:18080`. `fcos-funnel-guard.timer` is **disabled**: its public probe would now test the tunnel |
| Backups | `scripts/backup-to-github.sh` + user timers `fcos-backup{,-push}.timer` |
| Ops checkout | `~/fc-os-web` (scripts/units only, not served) |
| Prod DB access (Mac) | `bun run db:push:prod / db:sql:prod / db:seed:prod / db:studio:prod / db:psql:prod`; see `pushing-migrations.md` |

## Box-level settings (not in Coolify)

- **Docker DNS**: `/etc/docker/daemon.json` has `"bip": "10.0.0.1/24", "dns": ["10.0.0.1"]`, and
  `/etc/systemd/resolved.conf.d/docker-dns.conf` has `DNSStubListenerExtra=10.0.0.1`. The host DNS
  (WARP on 127.0.2.x) isn't reachable from containers, public resolvers are blocked, and the campus
  resolver drops AAAA queries. Without this, Coolify builds fail with "Could not resolve hostname".
- **`/etc/hosts` pins** (marker `fcos-warp-zt`): `srm2k29.cloudflareaccess.com`, `zero-trust-client.cloudflareclient.com`.
  WARP's DNS proxy dies while it re-registers, so without the pins it can't re-enroll. The tunnel guard re-adds them.
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

- `curl -I https://fc-os.tech` → 200, `cf-ray` …-BOM/SIN; a `/_next/static/*.js` goes `cf-cache-status` MISS then HIT.
- Coolify: app + `fcos-db` running (healthy).
- `warp-cli status` → Connected; `warp-cli settings` → `Include mode` + `MASQUE`; `curl -s 127.0.0.1:20241/ready` → `readyConnections` > 0.
- `systemctl list-timers fcos-tunnel-guard.timer`; `journalctl -t fcos-tunnel-guard -n 20`; `systemctl --user list-timers | grep fcos-backup`.
- OTP email arrives (Resend dashboard → Emails).

## Roll back to Worker + Funnel

The tunnel path is down and the guard can't fix it (`journalctl -t fcos-tunnel-guard` says
"TUNNEL STILL DOWN"):
1. On claw: `sudo systemctl enable --now fcos-funnel-guard.timer && sudo systemctl start fcos-funnel-guard`
   (re-arms the Funnel and checks the Caddy shim).
2. On the Mac: `~/.config/fc-os-tunnel/rollback-to-worker.sh`. It deletes the CNAMEs and re-attaches
   the Worker Custom Domains, using the API token in `~/.cf-fcos-token` plus wrangler's OAuth login.
   No API token? Dashboard: DNS → delete the `fc-os.tech`/`www` CNAMEs, then Workers → fc-os-proxy → Domains → add both.
3. Disable `fcos-tunnel-guard.timer` until the tunnel is back.

Re-enrolling WARP (e.g. after a reinstall): put `mdm.xml` (organization `srm2k29`, `auth_client_id`/`auth_client_secret`
of service token `claw-warp`) in `/var/lib/cloudflare-warp/`, make sure the hosts pins exist, then restart `warp-svc`.
New ZT profiles default to WireGuard, which campus blocks: the profile must say MASQUE.

## Known gaps

- Single box on dorm Wi-Fi and mains power; the only offsite copy is the GitHub backup.
- Failback design: `future-architecture.md`.
