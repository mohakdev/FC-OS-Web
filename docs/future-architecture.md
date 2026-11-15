# Future architecture — dual-mode (self-host ⇄ Neon failback)

Goal: keep the self-hosted stack as primary prod **and** be able to fail over to Neon Cloud
quickly (e.g. when the home box / wifi dies), with data movable in both directions. Today
that's only partial — see `production-runbook.md` "Known gaps". This is the clean target.

## The idea: one branch, two modes, switched by `.env` (not two branches)

| Layer | Home (default) | Neon failback | How |
|---|---|---|---|
| DB driver | `postgres-js` (Coolify Postgres 17 `fcos-db`) | **`neon-serverless` (WebSocket)** | `db.ts` branches on env. **Not** neon-http — it can't do interactive transactions; the WebSocket Pool driver can, so the existing `db.transaction` calls (`dbActions`, `opusDbActions`, `canonDbActions`) work unchanged on both. Re-add `@neondatabase/serverless` + `ws`. |
| Auth | self-hosted Better Auth | **same** self-hosted Better Auth | Drop Neon Auth (hosted) entirely. Better Auth needs only *a* Postgres — local or Neon. Its tables follow `DATABASE_URL`. |
| Mail | Resend | Resend | identical |
| Realtime | postgres-js LISTEN/NOTIFY (auto-reconnect) | neon-serverless LISTEN (manual reconnect) | isolated to `src/lib/realtime/pg-driver.ts` — swap that one file (see below) |
| Config | `DATABASE_URL` = local | `DATABASE_URL` = Neon (+ `ssl`) | only `.env` differs |

### Why this nails the requirement
- Same code runs both places. Flipping = change `.env`, rebuild, repoint the tunnel. Minutes.
- Both sides become an identical Postgres schema (app **+** Better Auth tables) → a plain
  bidirectional `pg_dump`/restore works either direction (active → standby, freeze-sync-flip),
  and crucially carries **auth identities** too (which a one-off app-data push cannot).

## Work it takes
1. `db.ts` driver switch by env + re-add `@neondatabase/serverless`/`ws`; conditional `ssl` in `drizzle.config.ts`.
   - **Realtime rides along:** app-wide realtime uses Postgres LISTEN/NOTIFY. postgres-js
     auto-reconnects + re-LISTENs; neon-serverless does **not** auto-resubscribe. The driver swap
     must also implement a manual reconnect loop in `src/lib/realtime/pg-driver.ts` (the only file
     that touches listen/notify). Everything else — hub, SSE route, client — stays unchanged.
2. **Prep the Neon standby**: push the self-host schema to Neon and migrate `neon_auth.user` →
   `public.user` (same as was done locally) so it's actually ready to spin up.
3. Bidirectional sync script + runbook (FK-safe). A forward Neon → local script existed (`sync-neon-to-local.sh`, removed in the Coolify move; in git history).
4. Close the pre-merge gates: confirm RBAC (`permissions` empty but flag-based) via an approver/feature pass.
5. Then merge `feat/local-self-hosting` → `main`, with `main` = the dual-mode self-hosted code.

This is a substantial change — plan it end-to-end (driver swap + Neon standby prep + cutover +
bidirectional sync) before executing.
