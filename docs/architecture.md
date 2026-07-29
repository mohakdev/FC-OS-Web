# Architecture

**Stack**: Next.js 16 (App Router, RSC) · React 19 · Drizzle ORM on Neon Postgres
(`@neondatabase/serverless`, `neon-http` driver) · Neon Auth (Better Auth) · Tailwind v4
· Zod v4.

### Auth + onboarding/approval flow

Auth is **passwordless email OTP** via Neon Auth. There is no signup — the first OTP
sign-in auto-creates the auth user.

- `src/lib/auth/server.ts` — singleton `auth` (`createNeonAuth`); exposes `.handler()`
  (API route), `.middleware()` (proxy), and `getSession()`.
- `src/lib/auth/client.ts` — browser `authClient`; OTP send + verify (`src/components/Login.tsx`).
- `src/app/api/auth/[...path]` — Neon Auth route handler.
- `src/proxy.ts` — gates **only** `/dashboard/*`, redirecting anonymous users to `/login`.
  Server Action POSTs (`next-action` header) are passed through untouched — running them
  through the session-refreshing middleware corrupts the action response. `/onboarding`
  and `/pending` are deliberately excluded and self-guard at the page level.
- `src/lib/auth/context.ts` — `getAuthState()` / `getAccessContext()` resolve the
  `AuthState` (`unauthenticated` | `no-profile` | `active` + `AccessContext`) from the
  session joined to `profiles` + `user_roles`.

The **two-stage gate**: (1) `proxy.ts` blocks anonymous traffic; (2) `dashboard/layout.tsx`
enforces the state machine — `no-profile` → `/onboarding`, status ≠ `approved` →
`/pending`. New members land in `pending_approval`; an approver decides via
**Member Requests**.

> **CRITICAL**: any RSC / Server Action / Route Handler that calls `auth.getSession()`
> (directly or via `getAuthState`) **must** set `export const dynamic = "force-dynamic"`.

### RBAC

Authorization is on **permissions, never role names**. Roles are a grouping; what a role
may *do* lives in the DB and is editable at runtime.

Tables: `roles` (enum `role_label`, `member` → `president` plus read-only `advisor` /
`alumni`, each `domain`- or `global`-scoped), `permissions` (the catalog),
`role_permissions` (the grid — who gets what), `user_roles` (a user's role per domain;
multi-domain membership = one row per domain). Domains: `technical`, `creatives`,
`operations`, `outreach`.

The catalog is `src/lib/auth/catalog.ts` (8 permissions: `member.approve|manage|remove`,
`settings.manage`, `role.manage`, `opus.task.manage`, `opus.config.manage`,
`opus.task.status.own`). `seed.ts` seeds the grid. Only add a permission when the feature
it gates exists — a checkbox that does nothing destroys trust in the grid.

**Scope is what narrows a grant to a domain**, and it is the *only* thing that does.
`getAuthState()` joins `user_roles ⋈ roles ⋈ role_permissions`, then `resolveGrants`
(`src/lib/auth/permissions.ts`) folds the rows by `roles.scope`:

- via a **`global`** role → applies in every domain
- via a **`domain`** role → applies only in the domain of that `user_roles` row

So an approver (global) manages every board and a lead (domain) only their own, with no
explicit domain check anywhere. Check grants with `can` (org-wide) / `canIn` (in a domain)
/ `canAny` (nav gating only) / `domainsWith`. **Never branch on `ctx.roleIds`.**

`resolveGrants` branches on `roles.scope` and nothing else. `user_roles` has no CHECK tying
`domain` to scope, so inferring it from `domain IS NULL` would turn one malformed row into
either an org-wide escalation (`('lead', NULL)`) or a lockout (`('president', 'technical')`).

**Grants are additive — there are no deny rules.** Read-only roles work by holding *zero*
permissions, which is only sound because they are **exclusive**: `checkExclusiveReadOnlyRole`
(`src/lib/auth/roles.ts`) forbids combining `advisor`/`alumni` with any granting role. Drop
that invariant and an alumni who also holds `lead` silently gains write access.

**Enforce authorization inside the Server Action.** Proxy/layout gating is not sufficient:
the dashboard layout never renders for a Server Action POST, and `proxy.ts` waves any
request carrying a `next-action` header straight through. Every mutating action gates on
`requireWriteAccess(permission)`, which checks signed-in **+ `status === "approved"` +
holds the permission**. The approval check must live there — rejecting a member leaves
their `user_roles` intact, so without it a removed member keeps every capability they had.
An action touching a specific domain must *also* call `canIn(ctx.grants, permission,
domain)` once it knows the domain; `requireWriteAccess` only does the cheap `canAny`
precheck. `onboarding/actions.ts` is the one exception (runs pre-profile).

**Org-wide actions gate on `requireGlobalWriteAccess` instead** — the permission grid, the
member directory (`updateMember`/`removeMember`) and the app-settings toggle. They have no
domain to narrow to, so the `canAny` precheck would be the *whole* check and a domain-scoped
grant would act club-wide: ticking `member.manage` on `lead` would hand every lead the
directory. Their pages already gate on global `can()`; this closes the gap between what the
page shows and what the action accepts.

`getAuthState()` is wrapped in React `cache()` — per-request only, so a revoked grant bites
on the very next request. **Never** move it to `unstable_cache` / `"use cache"`.

**Admin grid** — `/dashboard/settings/roles`, gated on global `role.manage` (president + VP;
HRM manages members but cannot rewrite the authority model). Writes a whole role's set at
once. Three lockout guards, all in the Server Action: protected grants (president ×
`role.manage`/`member.manage`) are irrevocable; you can't revoke `role.manage` from
*yourself*; and no change may take the org's last approved holder of
`role.manage`/`member.manage` (checked *inside* the transaction, so concurrent revokes can't
both commit).

The self-guard tests **capability loss, not membership of the edited role** — holding the
role you are editing is normal, so it only fires when no other *global* role of yours would
still grant `role.manage` (`keepsPermission`, `src/lib/auth/lockout.ts`). The membership
version of it blocked every save on any row the editor held, including rows that never had
`role.manage` at all.

**The lockout invariant belongs on every write path, not just the grid**, because three
different writes can empty it: `role_permissions` (the grid), `user_roles` (demote the only
president — `setMemberRoles`) and `profiles.status` (reject or remove them —
`setMemberDecision`; holders are counted only among *approved* profiles). All three take
`heldMustHavePermissions` before and after the write inside one transaction and fail on
`missingAfter` — "don't make it worse" rather than "must be non-empty", so a fresh seed with
no approved users can still approve its first president. Holders count only via
`global`-scoped roles, since both pages the invariant protects gate on `can()`.

The old `app_settings.domainLeadsCanApprove` toggle is now just a grant: it adds/removes
`member.approve` on `lead`/`co-lead`, and scope reproduces the own-domain-only intersection
for free. The column survives as a mirror; drop it once the grid replaces the switch in the
profile settings modal.

### Data layer

- Schemas: one table per file in `src/database/schemas/`, re-exported from `index.ts`;
  `db` is configured in `src/database/db.ts`. Drizzle config: `drizzle.config.ts`
  (migrations output to `drizzle/migrations`).
- `src/utils/dbActions.ts` owns the actual SQL (query + write helpers). Server Actions in
  `**/actions.ts` own the trust boundary: **Zod validation + authorization check first**,
  then call a `dbActions` helper.
- The `neon-http` driver has **no interactive transactions** — use `db.batch([...])` for
  atomic multi-statement writes (see `onboardProfile`).

### App structure

- `src/app/dashboard/layout.tsx` — the gated shell (sidebar + breadcrumb), passes
  `isApprover` and `canApproveMembers` (approver or enabled domain lead) to `AppSidebar`.
- `src/lib/dashboard-nav.ts` — single source of truth for sidebar nav (sections, hrefs,
  `requiresApprover`, `disabled`/`Soon` flags). Add tools here.
- `src/app/dashboard/member-directory/page.tsx` — lists approved members; passes
  `canManage` (`ctx.isApprover`) to the client, which gates the per-member edit/remove
  panel in the detail sheet.
- Opus (`/dashboard/opus`) is the per-domain kanban task manager — see `### Opus` below
  for the data model and the workspace built on top of it.

### Opus

Per-domain kanban PM tool. Schema is **fully data-driven and domain-scoped** so adding a
domain (a row in `domains`) lights up Opus for it with zero code changes — re-run
`bun run seed` to populate that domain's defaults. Schema lives in
`src/database/schemas/opus_*.ts`:

- **`opus_statuses`** / **`opus_priorities`** — per-domain kanban columns / priority levels.
  Both carry `position` (ordering), `isDefault` (seeded rows, protected from deletion at the
  app layer), and a `unique(domain, name)` constraint (enables idempotent seeding). Defaults
  seeded per domain: statuses Backlog/Todo/In Progress/Done/Cancelled; priorities
  Urgent/High/Medium/Low. **"No Priority" is not a row** — it's `priority_id IS NULL`.
  `opus_statuses` also carries `color` (hex, default `#6b7280`): rendered as a Linear-style
  progress ring whose fill angle = `(orderedIndex + 1) / nonCancelledCount` (see `StatusIcon`).
  **"Cancelled" is terminal, not a completion step**: it renders as a cross (lucide `CircleX`)
  and is excluded from the ring fraction, so the step before it (e.g. "Done") reads as the
  full ring. Detection/fraction live in `format.ts` (`isCancelledStatus`, `statusFraction`) —
  name-based, matching the existing `isStatusClosed`.
- **`opus_labels`** — per-domain custom labels (`name` + `color` hex). No defaults, no order.
- **`opus_tasks`** — the task table. `parent_task_id` self-FK (cascade) models sub-tasks;
  null = top-level. One-level nesting is enforced at the **app layer**, not the DB. Sub-task
  due dates inherit the parent's at the app layer. `status_id`/`priority_id` are FK
  **`restrict`** (can't delete a status/priority while tasks reference it); `priority_id`
  nullable; `created_by` FK **`set null`**; `position` orders cards within a column.
- **`opus_task_assignees`** / **`opus_task_labels`** — many-to-many junctions (composite PK),
  replacing the old array column. **`opus_task_links`** — references/URLs per task.

Authorization is **not** in the schema — enforce in Server Actions via the `user_roles`
row for the task's domain (member = edit only tasks assigned to them; lead/co-lead/associate
lead = manage their domain's tasks + statuses/priorities/labels; above-leads = full access).

**Workspace implementation:**

- Routes under `src/app/dashboard/opus/`: nested `layout.tsx` only guards access (no
  secondary sidebar). Opus navigation — Overview · Tasks (all domains) · Manage (only
  `manageableDomains`) — is a collapsible dropdown under "Opus" in the main `AppSidebar`,
  built server-side by `buildOpusNavChildren` (`src/lib/opus/nav.ts`) and injected via the
  generic `navChildren` seam on `AppSidebar`. `page.tsx` = Overview dashboard;
  `tasks/[domain]/page.tsx` = kanban
  board; `manage/[domain]/page.tsx` = status/priority/label editor (+ `manage/page.tsx`
  redirects to the first manageable domain). All `force-dynamic`. `[domain]` params are a
  `Promise` (Next 16) — `await params`.
- **Data layer** lives in `src/utils/opusDbActions.ts` (not the members' `dbActions.ts`),
  same trust-boundary convention. Key reads: `getOpusBoard`, `getOpusTaskDetail`,
  `getOpusDomainMeta`, `getDomainMembers`, `getOpusOverview`. Writes: `createOpusTask`,
  `updateOpusTask`, `moveOpusTask` (DnD persist), `deleteOpusTask`, and CRUD/reorder for
  statuses/priorities/labels — multi-statement writes go through a `runBatch` (`db.batch`)
  helper.
- **Server Actions** `src/app/dashboard/opus/actions.ts`: every mutation runs
  `requireWriteAccess()` then the Opus authz helpers in `src/lib/opus/permissions.ts`
  (`canManageDomain`, `canEditTask`, `manageableDomains` — these compute the manager set
  `lead`/`co-lead`/`associate lead` from `ctx.roleIds`, since `ctx.isDomainLead` excludes
  associate leads). Input validated with Zod incl. referential integrity (status/priority/
  label/assignee must belong to the task's domain). Due date is server-enforced future-only.
- **Client UI** (`_components/`, shadcn + `@dnd-kit`): `kanban-board` (DnD columns, optimistic
  move), `task-card`, `task-detail-dialog`, `task-fields-dialog` (create/edit + nested
  subtasks), `assignee-picker`/`label-picker` (Command combobox), `due-date-picker`,
  `manage-client`, `status-icon` (the progress ring).
- **Shared presentation** `src/lib/opus/format.ts` (client-safe, no DB imports):
  `domainIcons` (per-domain lucide icon, also used by `src/app/dashboard/page.tsx`),
  `formatDomain`, `isDomainId`, priority/label/due-date helpers, and the status helpers
  `isStatusClosed` / `isCancelledStatus` / `statusFraction` (consumed by `StatusIcon`,
  `kanban-board`, `task-detail-dialog`).
