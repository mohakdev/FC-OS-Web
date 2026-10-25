# Pushing Migrations

## This DB is synced with `push`, not `migrate`

There is **no `__drizzle_migrations` tracking table**. Schema is synced with `drizzle-kit push`,
which diffs the schema against the live DB and applies the changes. Files in `drizzle/migrations/`
are generated for the record and are **not replayed**.

> **Never run `drizzle-kit migrate`.** With no tracking table it replays from `0000` and fails
> ("relation already exists").

## Workflow (prod = Coolify `fcos-db` on the box)

1. Edit schema files under `src/database/schemas/`.
2. For the record: `bunx drizzle-kit generate --config drizzle.config.ts`.
3. Apply to prod: `bun run db:push:prod`. It opens an SSH tunnel, snapshots the DB and runs
   `drizzle-kit push --strict`, which shows the SQL and asks before applying. It needs a TTY. A
   drop+create is **not** a rename, so answer the prompts carefully.
   - No TTY (agent/CI): `bun run db:sql:prod drizzle/migrations/<n>_*.sql` applies the file in
     one transaction after a snapshot. Review the SQL first; it may contain `DROP`s.
4. If new reference data is needed: `bun run db:seed:prod` (snapshot, then `bun run seed` over the tunnel).
   It only adds rows, but that includes **re-granting any baseline permission someone revoked in the grid**.

Also available: `bun run db:studio:prod` (Drizzle Studio) and `bun run db:psql:prod`. Everything
is in `scripts/prod-db.sh`. Credentials are read live from Docker, never stored on the Mac.

## Undo

Snapshots live in `~/db-snapshots/` on the box (newest 10). To restore one:
```bash
# on the box (ssh aio)
docker exec -i <fcos-db container> pg_restore -U postgres -d postgres -c --if-exists \
  < ~/db-snapshots/pre-push-<ts>.dump
```
