# RBAC — open follow-ups

Left over after the permission-model cutover (2026-07-13, commits `f18caf7` → `408c21c`).
The model itself is live and verified on prod; none of these block it. Ordered by when
they'll actually hurt you, not by size.

Background: `docs/architecture.md` `### RBAC`. Operational notes:
`docs/production-runbook.md` `### RBAC / permissions`.

---

## 1. Neon standby has none of this — a failover today is a total lockout

**Severity: high, but only on failover. Do this before you ever promote the standby.**

`cloud.fc-os.tech` (the Neon standby, pm2 `fc-os`) never got the RBAC migration. Its
`role_permissions` table has no composite PK and **zero rows**.

Code that reads an empty grid denies *everything* to *everyone* — including `role.manage`,
so nobody can open `/dashboard/settings/roles` to fix it. Org-wide lockout, recoverable
only by SSH.

**Fix — in this order, and seed BEFORE the app serves traffic:**

```sql
-- 1. restore the composite PK (0003 created it, 0016 dropped it)
ALTER TABLE role_permissions
  ADD CONSTRAINT role_permissions_role_id_permission_id_pk
  PRIMARY KEY (role_id, permission_id);
```

```bash
# 2. seed the catalog + grid (idempotent)
bun run seed

# 3. sanity-check BEFORE starting the app
psql "$DATABASE_URL" -c "
SELECT (SELECT count(*) FROM permissions) AS permissions,
       (SELECT count(*) FROM role_permissions) AS grants,
       (SELECT count(DISTINCT ur.user_id)
          FROM role_permissions rp
          JOIN user_roles ur ON ur.role = rp.role_id
          JOIN profiles p ON p.user_id = ur.user_id
         WHERE rp.permission_id = 'role.manage' AND p.status = 'approved') AS role_manage_holders;"
# expect: permissions=8, grants>=35, role_manage_holders > 0
```

Only then build + restart. If `role_manage_holders` is 0, **stop** — starting the app
locks the club out.

---

## 2. `seed.ts` doesn't grant HRM `role.manage`

**Severity: low day-to-day, high on a fresh DB.**

HRM was granted `role.manage` deliberately (via the admin grid, on prod). But
`BASE_GRANTS` in `src/database/seed.ts` gives `role.manage` only to `president` and
`vice president`.

This is harmless on the existing DB — the seed only ever *adds* rows
(`onConflictDoNothing`), so re-running it will never revoke him. But any **DB built fresh
from seed** (new box, standby promotion, local reset) comes up with HRM lacking it, and
nobody will notice until an HRM can't open the page.

**Decide one:**

- **Bake it in** — add `"role.manage"` to the `human resource manager` entry in
  `BASE_GRANTS`. Seed then matches production intent. Do this if HRM holding it is the
  permanent policy.
- **Leave the seed conservative** — treat the seed as a minimal safe baseline and grant HRM
  via the grid on each new environment. Do this if it's a one-off for the current HRM.

Whichever you pick, write it down — right now the seed and prod disagree and nothing
records why.

---

## 3. Drizzle migration drift — `0015` is missing

**Severity: medium. A landmine under the next schema change.**

`drizzle/migrations/` jumps `0014_famous_meteorite.sql` → `0016_bitter_agent_zero.sql`.
There is no `0015`. The folder is therefore **not** a faithful record of what's in prod.

This repo syncs with `drizzle-kit push`, not `migrate` (see `docs/pushing-migrations.md`),
and `push` diffs your TypeScript schema against the **live database**. It will happily emit
`DROP COLUMN` / `DROP TABLE` for anything that drifted and that your schema no longer
mentions. Running it blind on prod is how a routine schema change becomes a data-loss
incident.

(This is why the RBAC work applied its one DDL statement — the `role_permissions` PK —
directly and targeted, rather than running a full-schema `push`.)

**Fix:**

1. Introspect the live DB (`drizzle-kit introspect` / `pull`) and diff it against
   `src/database/schemas/`.
2. Identify what `0015` was, and anything else that drifted.
3. Reconcile, then regenerate a clean baseline so the folder tells the truth again.
4. Until then: **never run bare `drizzle-kit push` against prod.** Generate the SQL, read
   every statement, and apply targeted DDL.

---

## 4. Parity test hand-mirrors the seed

**Severity: low. It degrades silently, which is the annoying part.**

`src/lib/auth/permissions.test.ts` re-declares the grant table (`GRANTS`, `SCOPE`,
`DOMAIN_LEADS_CAN_APPROVE`) as a hand-written copy of `BASE_GRANTS` in
`src/database/seed.ts`.

Edit the seed and forget the test, and the harness cheerfully verifies a model that isn't
the one you ship — 31k assertions, all green, all meaningless.

**Fix:** extract `BASE_GRANTS` out of `seed.ts` into a plain module (e.g.
`src/lib/auth/grants.ts`) and import it in both. It can't live in `seed.ts` as-is: that file
has a top-level `import "dotenv/config"` and imports `db`, so importing it from a test would
open a DB connection at module load.

Note the test must keep its *own* copy of the **old** hardcoded role Sets (`APPROVER_ROLES`
et al). Those are the frozen historical reference the new model is compared against — they
are supposed to be a duplicate, and should never be derived from anything.

---

## Not doing (deliberately)

- ~~Dropping `app_settings.domain_leads_can_approve`~~ — done 2026-11-14: the Settings
  dialog, `settings.manage` and the `app_settings` table are gone; the grid decides.
- **Postgres RLS.** Considered and rejected: the app connects as a single owner role, so
  policies would need a non-owner DB role plus per-request `SET LOCAL app.user_id`, and every
  query path re-audited. The app is the trust boundary; app-level checks are the right layer
  here. Design notes would go in `docs/future-architecture.md` if this ever comes back.
- **A `role_permissions` audit log.** Worth having eventually ("who took away my access?"),
  but there's no audit table today (`activity` is club events, not audit) and the grid has
  ~5 possible editors. Add it when the grid gets used in anger.
