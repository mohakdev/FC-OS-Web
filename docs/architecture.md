# Architecture

**Stack**: Next.js 16 (App Router, RSC, `output: "standalone"`) · React 19 · Drizzle ORM on
self-hosted **Postgres 17** (`postgres-js` driver, `drizzle-orm/postgres-js`) · self-hosted
**Better Auth** (email OTP, mail over SMTP/Resend) · S3-compatible object storage (Garage) ·
Tailwind v4 · shadcn/ui · Zod v4. Tests: `bun test` (`src/lib/**/*.test.ts`).

Deployment (Coolify on box `claw`, Cloudflare Tunnel): `SELF_HOSTING.md`,
`production-runbook.md`. Required env vars: `.env.example`.

### Auth + onboarding/approval flow

Auth is **passwordless email OTP** via self-hosted Better Auth. There is no signup — the
first OTP sign-in auto-creates the auth user. Sign-in is restricted to SRMIST addresses
(`SRMIST_EMAIL_SUFFIX` in `src/lib/validation/onboarding.ts`), enforced server-side both on
OTP send and on user creation.

- `src/lib/auth/server.ts` — singleton `auth` (`betterAuth` + `drizzleAdapter` +
  `emailOTP` + `nextCookies`). OTP mail goes out through nodemailer over `SMTP_*`
  (`MAIL_FROM` sender). Server code reads the session via `auth.api.getSession(...)`.
  Requires `BETTER_AUTH_SECRET` (and `BETTER_AUTH_URL`). Auth tables:
  `src/database/schemas/auth.ts`.
- `src/lib/auth/client.ts` — browser `authClient` (`createAuthClient` + `emailOTPClient`);
  OTP send + verify in `src/components/Login.tsx`.
- `src/app/api/auth/[...path]/route.ts` — `toNextJsHandler(auth)`.
- `src/proxy.ts` — gates **only** `/dashboard/*`: no Better Auth session cookie
  (`getSessionCookie`, no DB hit) → redirect to `/login`. Server Action POSTs
  (`next-action` header) are passed through untouched — a redirect would corrupt the action
  response. `/onboarding` and `/pending` are deliberately excluded and self-guard at the
  page level.
- `src/app/login`, `src/app/onboarding` (form + `actions.ts` → `onboardProfile`),
  `src/app/onboarding/details`, `src/app/pending` — the pre-dashboard pages.
- **Onboarding is 2 steps.** Step 1 (`/onboarding`): name, phone (`phoneSchema`, Indian
  10-digit → `+91…`), **RA number** (`raNumberSchema`: `RA` + 13 digits, trimmed +
  uppercased, `profiles.ra_number` UNIQUE), DOB, gender, domains → creates the pending
  profile. Step 2 (`/onboarding/details`): optional picture, quote, links (Skip / Finish)
  → `/pending`. RA/phone collisions get specific messages (pre-check + 23505 race via
  `uniqueViolationConstraint` in `src/lib/db/errors.ts`); errors never echo an ID.
- `src/lib/auth/context.ts` — `getAuthState()` / `getAccessContext()` resolve the
  `AuthState` (`unauthenticated` | `no-profile` | `active` + `AccessContext`) from the
  session joined to `profiles` + `user_roles`.

The **two-stage gate**: (1) `proxy.ts` blocks anonymous traffic; (2) `dashboard/layout.tsx`
enforces the state machine — `no-profile` → `/onboarding`, status ≠ `approved` →
`/pending`, `needsRaNumber(ctx)` → `/onboarding/details`. New members land in
`pending_approval`; an approver decides via **Member Requests**.

**RA gate** (`needsRaNumber` in `src/lib/auth/context.ts`): approved **and** no RA **and**
the member's *real* grants are non-empty. Read-only roles (advisor / alumni — derived as
"holds zero permissions", same rule as `checkExclusiveReadOnlyRole`) are exempt; real
grants so "view as" never triggers/skips it. The same `/onboarding/details` screen then
asks RA (required, prefilled extras, no Skip) once. `completeOwnProfileDetails` writes the
RA only `WHERE ra_number IS NULL` — members can never change it. Only `member.ra.edit`
(global; superadmin by default) can replace it, from the Member Directory sheet
(`updateMemberRa`; replace only, never clear). RA is visible to all approved members
(directory sheet + search, own profile, Member Requests rows).

> **CRITICAL**: any RSC / Server Action / Route Handler that calls `auth.api.getSession()`
> (directly or via `getAuthState`) **must** set `export const dynamic = "force-dynamic"`.

### RBAC

Authorization is on **permissions, never role names**. Roles are a grouping; what a role
may *do* lives in the DB and is editable at runtime.

Tables: `roles` (enum `role_label`, `member` → `president` plus read-only `advisor` /
`alumni`, each `domain`- or `global`-scoped), `permissions` (the catalog),
`role_permissions` (the grid — who gets what), `user_roles` (a user's role per domain;
multi-domain membership = one row per domain). Domains: `technical`, `creatives`,
`operations`, `outreach`.

The catalog is `src/lib/auth/catalog.ts` (`member.approve|manage|remove`, `role.manage`,
`opus.*`, `bug.manage`, `canon.*`, `profile.links.extended`, `platform.view_as`). `settings.manage` was removed
2026-11-14 along with the profile-page Settings dialog. `seed.ts` seeds the grid. Only add a permission when the feature
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

**Org-wide actions gate on `requireGlobalWriteAccess` instead** — the permission grid
(`setRolePermissions`), the member directory (`member.manage` edits, `member.remove`) and
bug-report resolve/delete (`bug.manage`). They have no
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

"Domain leads can approve members" is just a grant: tick `member.approve` on
`lead`/`co-lead` in the grid, and scope reproduces the own-domain-only intersection for free.
The old profile-page Settings toggle and its `app_settings` mirror table were removed
2026-11-14; the seed no longer grants it, so the grid is the only place it is decided.

**Superadmin + "view as"** — `superadmin` is the platform maintainer's role: global scope,
holds every permission, whole grid row protected (`PROTECTED_GRANTS`), and **DB-only** —
`ASSIGNABLE_ROLES` excludes it from every role-writing action, `setMemberRoles` carries an
existing superadmin row across its delete/reinsert, and `setMemberDecision` refuses to reject
it. Assign with SQL on the box. It holds `platform.view_as`, which shows a floating toolbar
(`src/components/view-as-toolbar.tsx`) to switch into one role (+ domain) for up to 1 hour via
the `fcos_view_as` cookie (`src/lib/auth/view-as.ts`). While switched, `getAuthState` returns
that role's `roleIds`/`domainIds`/`grants`, with grants always **intersected** with the user's
real grants (`intersectGrants`) so a switch can only narrow. `realGrants` (switcher only) and
`viewAs` ride along on `AccessContext`. Writes are real; each gated write logs a
`view_as_write` JSON line to the server log.

### Data layer

- Schemas: one table per file in `src/database/schemas/`, re-exported from `index.ts`;
  `db` is configured in `src/database/db.ts` (`postgres(DATABASE_URL)` → `drizzle`; the raw
  `client` is also exported for realtime LISTEN/NOTIFY). Drizzle config: `drizzle.config.ts`
  (migrations output to `drizzle/migrations`; SSL comes from the connection string).
  Schema changes sync with `drizzle-kit push`, never `migrate` — `pushing-migrations.md`.
- SQL lives in per-area helper files, never in components or actions:
  `src/utils/dbActions.ts` (profiles, onboarding, members, roles, avatars),
  `opusDbActions.ts`, `canonDbActions.ts`, `bugDbActions.ts`. Server Actions in
  `**/actions.ts` own the trust boundary: **Zod validation + authorization check first**,
  then call a helper.
- `postgres-js` supports **real interactive transactions** — use
  `db.transaction(async (tx) => …)` for atomic multi-statement writes (e.g.
  `onboardProfile`, `setMemberRoles`, `setMemberDecision`, every multi-row Opus/Canon
  write). The old neon-http `db.batch()` restriction no longer applies.
- `bun run seed` (`src/database/seed.ts`) is idempotent: roles + scopes, the permission
  catalog, the default `role_permissions` grid, domains, and per-domain Opus
  statuses/priorities. Prod: `bun run db:seed:prod` (`scripts/prod-db.sh`).
- The old `activity` / `attendance` stub tables were dropped (migration `0025`) in favour of
  Forum's `forum_events` table — see `### Forum`. Attendance will reference it.

### Profile + avatars

- `/dashboard/profile` → **Customize** dialog (`profile/customize-dialog.tsx`): own profile
  only, any approved member, no permission. Edits `profiles.phone` (Indian 10-digit,
  stored `+91XXXXXXXXXX`, unique) + `date_of_birth`, and `profile_details` (quote ≤150,
  ≤3 links (≤6 with `profile.links.extended`, superadmin by default; checked in the
  action via `linkLimit()`), avatar key). Rules: `src/lib/validation/profile.ts`.
- Superadmins get `src/components/superadmin-badge.tsx` (green, shadcn `shimmer`) in the
  directory role badges and the sidebar user menu. Display only; it reads the real role
  (`holdsSuperadmin`), so it doesn't change under "view as".
- Links store only the URL; icon + label come from the hostname at render time
  (`src/lib/profile/links.ts`). Unknown hosts (personal sites) → globe + bare hostname.
- Avatar / quote / links editors are shared components in `src/components/profile/`
  (used by the Customize dialog and `/onboarding/details`). `uploadAvatar` / `removeAvatar`
  accept a **pending** applicant too (own profile only, not rejected), and the avatar
  route always serves a member their own picture.
- Avatars: client crops (react-easy-crop) → server re-encodes with sharp to 512px webp →
  private S3-compatible bucket via `src/lib/storage/s3.ts` (env `S3_ENDPOINT`,
  `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, optional `S3_REGION`). Browsers never hit
  the bucket: `src/app/api/avatar/[userId]/route.ts` is auth-gated (approved members) and
  streams it, cached `private, immutable` behind a `?v=<avatar_updated_at>` buster.
  Render with `src/components/profile-avatar.tsx`.

### App structure

- `src/app/dashboard/layout.tsx` — the gated shell. Runs the state machine, then renders
  `TooltipProvider` → `RealtimeProvider` → `SidebarProvider` (`AppSidebar` + breadcrumb) and,
  for `platform.view_as` holders, the `ViewAsToolbar`. It passes `AppSidebar` only plain
  serializable data: `permissions` (`allPermissions(ctx.grants)`), `user` (name, email,
  domains, `isSuperadmin`, avatar version) and `navData` (`manageableDomains`, `myDomains`,
  `pendingRequests` badge count).
- `src/lib/dashboard-nav.ts` — single source of truth for sidebar nav: sections
  (overview / Tools / Administration), items with `requiresPermission` (shown when held
  globally or in any domain — e.g. Member Requests needs `member.approve`, Roles &
  Permissions needs `role.manage`), `disabled` (hidden until the tool ships) and
  `children` (collapsible sub-nav, usually injected at render time through `AppSidebar`'s
  `navChildren` seam). Add tools here.
- `src/app/dashboard/page.tsx` — the dashboard home (your profile, domains, roles).
- Shared shell components live in `src/components/` (`app-sidebar`, `nav-user`,
  `DynamicBreadcrumb`, `profile-avatar`, `superadmin-badge`, `view-as-toolbar`,
  `realtime/`, `theme/`); shadcn primitives in `src/components/ui/`.
- Opus (`/dashboard/opus`) is the per-domain kanban task manager — see `### Opus` below
  for the data model and the workspace built on top of it.

### Members (directory + requests)

- **Member Requests** `src/app/dashboard/member-requests/` — page gated on
  `canAny(member.approve)`, lists `getPendingMembersFor(ctx.grants)` (only applicants in
  domains where you hold the grant). `decideMember` runs `requireWriteAccess("member.approve")`,
  then requires `canIn` on at least one of the applicant's domains. On approve, the approver
  may trim the applicant's domains/roles (≥1 must remain; read-only roles stay exclusive via
  `checkExclusiveReadOnlyRole`). Writes go through `setMemberRoles` / `setMemberDecision`
  (both carry the lockout invariant — see `### RBAC`).
- **Member Directory** `src/app/dashboard/member-directory/` — lists approved members;
  `canManage` = global `can(member.manage)` gates the edit/remove panel in the detail sheet.
  Actions use `requireGlobalWriteAccess("member.manage" | "member.remove")`.
- Both pages mount `<Refresher scope="member"/>`; every member write emits
  `notifyRealtime({ scope: "member" })`.

### Bug Reports

`/dashboard/bug-reports` — club-wide bug tracker for FC OS itself. Schema
`src/database/schemas/bug_reports.ts` (`open | fixed`, `reported_by`/`resolved_by` FK
`set null`). SQL in `src/utils/bugDbActions.ts`. Any approved member can file
(`submitBugAction`, no permission); resolve/reopen/delete need global `bug.manage`
(`requireGlobalWriteAccess`). Realtime scope `bug-report`.

### Forum

Internal club meetings at `/dashboard/forum`: domain meetings and full-team meetings, with
email invites. **Forum is internal-only.** External events (Ideathon, Hackathon, InterClub,
…) are planned in **Canon** (`### Canon`), which already has its own categories, and the two
tools are not linked. When the Attendance Tracker is built, meeting attendance will reference
`forum_events`. Everything follows the tool-prefix convention: tables / enums `forum_*`,
permissions `forum.*`, code in `src/lib/forum/` + `src/utils/forumDbActions.ts`, realtime
scope `forum`.

- **Schema** `src/database/schemas/forum_events.ts`: `forum_events` (`kind` =
  `domain_meeting | club_meeting`, `domain` set **iff** domain meeting — CHECK
  `forum_events_domain_kind_check`; title ≤80, description, venue, `starts_at` (required) /
  `ends_at` timestamptz with `ends_at > starts_at`, `status` `scheduled | cancelled`,
  `revision`, created/updated at+by). `revision` bumps on every change the audience should
  hear about (title, time, venue, cancel) and is the iCalendar SEQUENCE.
  `forum_invites.ts`: a log of sent mail, PK `(event_id, profile_id, kind, revision)`.
- **Audience is derived, never stored** (`getEventAudience` in `src/utils/forumDbActions.ts`):
  - domain meeting → approved members with a `user_roles` row in that domain **plus
    leadership** — anyone holding a granting `global`-scoped role (president / VP / HRM) is
    invited to every domain's meetings;
  - full-team meeting → every approved member.

  A row only qualifies through a role that grants ≥1 permission, so read-only advisor /
  alumni are never expected; "leadership" and "read-only" come from `roles.scope` + the grid,
  never role names. `superadmin` never qualifies anyone (platform role, not a club position).
  `expectedDomains(ctx)` applies the same rule for the list's "My meetings" filter. Kind +
  domain are **immutable after creation** (changing them would swap the audience under
  people already invited) — cancel and recreate instead.
- **Authz** `src/lib/forum/permissions.ts` (`canManageEvent`, `createOptions`):
  `forum.domain.manage` via `canIn` (seeded to lead / co-lead / associate lead, so own domain
  only; leadership holds it globally) and `forum.club.manage` via global `can` (president /
  VP / HRM). Actions (`src/app/dashboard/forum/actions.ts`) gate through
  `requireEventManager`: `requireGlobalWriteAccess` for full-team, `requireWriteAccess` +
  `canIn` for domain meetings. Any approved member can **read** every event. `external` is
  not manageable until P2.
- **Validation** `src/lib/forum/schema.ts` (`meetingInputSchema`): the form sends an IST day +
  start/end time; the schema turns them into instants (`istToDate`, fixed `+05:30`). New
  meetings must start in the future (checked in the action).
- **Invites** `src/lib/forum/send.ts` `sendEventMail(eventId, kind)`, started **detached**
  from the action (`mailLater`) so it returns immediately. Not `after()`: its callbacks wait
  for the response's `onClose`, which never fired for these actions, so invites silently
  never went out. Detached promises are safe because FC OS is one long-lived Node server.
  Recipients = audience minus anyone already logged for that (kind, revision); a row is
  written per accepted message, so retries never double-mail and **Send N invites** on the
  detail page finishes any interrupted run (or reaches members who joined later). `invite` →
  audience not yet invited; `update` / `cancel` → only people who were invited; nothing is
  mailed once a meeting has started. Each mail carries an `.ics` (`src/lib/forum/ics.ts`,
  METHOD REQUEST/CANCEL, UID `<id>@fc-os.tech`). 600 ms between messages to stay under
  Resend's rate limit; mind the plan's daily quota for full-team invites. SMTP transport is
  shared with OTP in `src/lib/mail.ts`.
- **UI** `src/app/dashboard/forum/`: `page.tsx` (Upcoming / Past tabs, filter My meetings /
  everything / full-team / per domain, **New meeting** only if `createOptions` allows any),
  `[id]/page.tsx` (when/where/agenda, audience table with per-member invite status for
  managers, edit / send invites / cancel / delete via `_components/event-actions.tsx`),
  `_components/meeting-dialog.tsx` (create + edit). Display helpers `src/lib/forum/format.ts`
  (IST). Tests: `src/lib/forum/forum.test.ts`.
- **Realtime** scope `forum`: every write and every finished mail batch emits it; both pages
  mount `<Refresher scope="forum"/>`.

### Placeholder tools

MoM, Attendance Tracker, FC TV CMS and Performance Tracker are stub `page.tsx` routes,
flagged `disabled` in `dashboard-nav.ts`, with **no permissions in the catalog** (a
permission is added only when its feature exists). Attendance has a full spec:
`docs/specs/attendance-tracker.md`; when built it records attendance against Forum `events`
(members/volunteers in one table, external participants in a separate one).

### Opus

Per-domain kanban PM tool. Schema is **fully data-driven and domain-scoped** so adding a
domain (a row in `domains`) lights up Opus for it with zero code changes — re-run
`bun run seed` to populate that domain's defaults. Schema lives in
`src/database/schemas/opus_*.ts`:

- **`opus_statuses`** / **`opus_priorities`** — per-domain kanban columns / priority levels.
  Both carry `position` (ordering), `isDefault` (seeded rows, protected from deletion at the
  app layer), and a `unique(domain, name)` constraint (enables idempotent seeding). Defaults
  seeded per domain: statuses Backlog/Todo/In Progress/Done/Cancelled; priorities
  Low/Medium/High/Urgent (positions 0→3). **"No Priority" is not a row** — it's
  `priority_id IS NULL`. `opus_statuses` also carries `color` (hex, default `#6b7280`),
  rendered as a Linear-style progress ring (`StatusIcon`).
  **Both tables carry `ring_full`** (boolean, data-driven, toggled in Manage via
  `setStatusFullAction` / `setPriorityFullAction`). A `ring_full` status always renders a
  complete ring (a "finished" state); every other status fills by its rank among the
  non-full ("dynamic") statuses, `(index + 1) / dynamicCount` — `statusFraction` in
  `format.ts`. Full rows are kept ordered below the dynamic ones. Seeded: Done + Cancelled
  are `ring_full`. Priorities use the same rule for their bar icon (`priorityBars`,
  `PriorityIcon`): a `ring_full` priority (seeded: Urgent) lights every bar. The one
  remaining name-based helper is `isStatusClosed` ("Done"/"Cancelled"), used only to stop
  closed tasks reading as overdue (`isOverdue`).
- **`opus_labels`** — per-domain custom labels (`name` + `color` hex). No defaults, no order.
- **`opus_tasks`** — the task table. `parent_task_id` self-FK (cascade) models sub-tasks;
  null = top-level. One-level nesting is enforced at the **app layer**, not the DB. Sub-task
  due dates inherit the parent's at the app layer. `status_id`/`priority_id` are FK
  **`restrict`** (can't delete a status/priority while tasks reference it); `priority_id`
  nullable; `created_by` FK **`set null`**; `position` orders cards within a column.
- **`opus_task_assignees`** / **`opus_task_labels`** — many-to-many junctions (composite PK),
  replacing the old array column. **`opus_task_links`** — references/URLs per task.

Authorization is **not** in the schema — it is the permission grid (`### RBAC`), checked
per domain with `canIn`. Three permissions: `opus.task.manage` (create/edit/move/delete
tasks + subtasks), `opus.config.manage` (statuses/priorities/labels), `opus.task.status.own`
(change the *status* of a task you're assigned to — the only field a non-manager may touch).
Leads hold the manage grants via domain-scoped roles (own domain only); approvers via
global roles (every domain). Every approved member can **read** every domain's board.

**Workspace implementation:**

- Routes under `src/app/dashboard/opus/`: nested `layout.tsx` only guards access (no
  secondary sidebar). Opus navigation is a collapsible group under "Opus" in the main
  `AppSidebar`: **Overview** + **one row per domain board** (your own domains first), and a
  hover "Manage" gear (`action`) on the domains in `manageableDomains`. It's built by
  `buildOpusNavChildren` (`src/lib/opus/nav.ts`) from the serializable `navData` the layout
  passes, and injected via the generic `navChildren` seam. `page.tsx` = Overview dashboard;
  `tasks/[domain]/page.tsx` = kanban
  board; `manage/[domain]/page.tsx` = status/priority/label editor (+ `manage/page.tsx`
  redirects to the first manageable domain). All `force-dynamic`. `[domain]` params are a
  `Promise` (Next 16) — `await params`.
- **Data layer** lives in `src/utils/opusDbActions.ts` (not the members' `dbActions.ts`),
  same trust-boundary convention. Key reads: `getOpusBoard`, `getOpusTaskDetail`,
  `getOpusDomainMeta`, `getDomainMembers`, `getOpusOverview`. Writes: `createOpusTask`,
  `updateOpusTask`, `setOpusTaskStatus`, `moveOpusTask` (DnD persist), `deleteOpusTask`, and
  CRUD/reorder/`set…Full` for statuses/priorities/labels. Authz lookups: `getTaskAuthInfo`,
  `isTopLevelTask`, `statusDomain`/`priorityDomain`/`labelDomain` (+ `…ByIds`),
  `getParentDueDate`. Multi-statement writes use `db.transaction`.
- **Server Actions** `src/app/dashboard/opus/actions.ts`: every mutation runs
  `requireWriteAccess(permission)` then the domain check from `src/lib/opus/permissions.ts`
  — thin wrappers over `canIn`: `canManageDomain` (`opus.task.manage`), `canManageConfig`
  (`opus.config.manage`), `manageableDomains` (`domainsWith(opus.config.manage)`),
  `canChangeTaskStatus` (manager, or `opus.task.status.own` + assigned). Input validated
  with Zod incl. referential integrity (status/priority/label/assignee must belong to the
  task's domain). Due date is server-enforced future-only; subtasks inherit the parent's due
  date and one-level nesting is enforced here. `loadTaskDetailAction` (read) needs only an
  approved member. Writes call `revalidateBoard`/`revalidateManage`, which also emit
  `notifyRealtime({ scope: "opus-board", domain })`.
- **Client UI** (`_components/`, shadcn + `@dnd-kit`): `kanban-board` (DnD columns, optimistic
  move; also hosts the **board ⇄ table** view toggle and local drafts), `task-table` (table
  view), `task-card`, `task-detail-dialog`, `task-fields-dialog` (create/edit + nested
  subtasks), `assignee-picker`/`label-picker` (Command combobox), `due-date-picker`,
  `manage-client`, `status-icon` (progress ring), `priority-icon` (bars), `types.ts`.
- **Client hooks** `src/lib/opus/`: `use-persisted-view.ts` (board/table choice in
  `localStorage`, per browser) and `use-task-drafts.ts` (unsent create-task drafts +
  staged subtasks kept in `localStorage`, per domain).
- **Shared presentation** `src/lib/opus/format.ts` (client-safe, no DB imports):
  `DOMAIN_IDS`, `domainIcons` (per-domain lucide icon, also used by
  `src/app/dashboard/page.tsx`), `formatDomain`, `isDomainId`, `initials`, `priorityBars`,
  `statusFraction`, `isStatusClosed`, `isOverdue`, `formatDueDate`, `labelTextColor`.

### Canon

The club's **single source of truth** — v1 covers events (spec: `docs/specs/SSOT.md`).
Routes under `src/app/dashboard/canon/`: index `page.tsx` (cards grouped Ongoing → Upcoming →
Past by IST date), event page `[id]/page.tsx`, server actions `actions.ts`.

- **Schema** `src/database/schemas/canon_*.ts`: `canon_events` (name ≤80, category, paid +
  optional ₹ fee, participation `individual|team|both` + team min/max — `canon_events_team_size_check`
  CHECK: team/both need 2 ≤ min ≤ max ≤ 10, individual has none — short desc, `draft|published`, created/updated at+by), child tables
  `canon_event_dates` (one row per kind: event/marketing/registration, `date` range +
  tentative/confirmed), `canon_event_venues` (ordered, optional `days`, status ladder
  not_booked → unconfirmed → confirmed → booked), `canon_event_spocs`, `canon_event_phases`
  (markdown body), `canon_categories` (editable list, seeded with 4), `canon_event_revisions`
  (who/when/which fields — stored for a future History view).
- **Data layer** `src/utils/canonDbActions.ts`. `saveCanonEvent` replaces the event + child rows
  in one `db.transaction`, guarded by an **optimistic lock**: the UPDATE matches
  `date_trunc('milliseconds', updated_at)` against the version the editor loaded, so a
  concurrent save returns `"stale"` instead of silently overwriting. No-op saves return
  `"unchanged"` and write no revision.
- **Authz** `src/lib/canon/permissions.ts`. `canon.event.manage` (HRM/VP/President) counts only
  when held **globally** (`can`) — create/delete, edit any event, assign SPOCs, categories.
  `canon.event.edit.own` (every non-read-only role) + being a SPOC on that event = edit +
  publish, but a SPOC's save keeps the stored SPOC list. Drafts are visible only to managers
  and the event's SPOCs (hidden drafts 404).
- **UI** — read view and editor are **one layout** (`_components/event-document.tsx`, `editing`
  flag); fields are shadcn Input/Textarea with the Canon-only `ghost()` className (no border,
  no fill). Event flow uses shadcn **Trace** (`src/components/ui/trace.tsx`). Phase bodies
  render via `react-markdown` (no raw HTML). Status badges use the semantic `success` /
  `warning` / `info` / `destructive` Badge variants backed by `--success/--warning/--info`
  tokens in `globals.css` (hue-fixed across themes).
- **Display** `src/lib/canon/format.ts`: days `DD Mon YYYY` (string-based, no TZ shift), stamps
  `DD Mon YYYY; hh:mm AM/PM` in IST, relative "x ago" computed server-side at render.
- **Realtime** — every write emits `notifyRealtime({ scope: "canon" })`; both pages mount
  `<Refresher scope="canon"/>`. The editor keeps its draft in state, so a refresh never clobbers
  in-progress edits; it shows a stale warning instead.

### Realtime

App-wide live updates. The signal says only *what changed*, never row data: clients re-fetch
the current route's RSC payload.

```
Server Action write → revalidatePath → notifyRealtime(evt)      src/lib/realtime/notify.ts
  → pg NOTIFY on channel `fc_realtime`                           src/lib/realtime/pg-driver.ts
  → process-wide hub (one LISTEN, globalThis-guarded)            src/lib/realtime/server.ts
  → SSE GET /api/realtime (nodejs, force-dynamic,
     approved members only, `: ping` heartbeat every 25 s)       src/app/api/realtime/route.ts
  → one EventSource("/api/realtime") per tab, 250 ms debounce    src/components/realtime/realtime-provider.tsx
  → router.refresh()                                             useRealtimeEvent / <Refresher>
```

- **Events** (`RealtimeEvent`): `{ scope: "opus-board", domain }`, `{ scope: "member" }`,
  `{ scope: "bug-report" }`, `{ scope: "canon" }`, `{ scope: "forum" }`. Adding a scope = extend the union, emit
  it from the action, listen for it on the page.
- **Emitters**: Opus `revalidateBoard`/`revalidateManage`; member-requests, member-directory,
  profile and roles-grid actions (`member`); bug-reports (`bug-report`); Canon (`canon`);
  Forum actions + finished invite batches (`forum`).
  Call `notifyRealtime` **after** the write + `revalidatePath`.
- **Listeners**: `RealtimeProvider` wraps the dashboard shell (so the layout's sidebar badge
  stays live). Server-rendered pages with no client router of their own mount
  `<Refresher scope=… [domain=…]/>` (Opus overview, Member Directory, Member Requests, Bug
  Reports, both Canon pages, both Forum pages); client components use `useRealtimeEvent(predicate, handler)`.
- The EventSource URL is same-origin relative — no env var; works on localhost and behind
  the tunnel.
- **All driver-specific LISTEN/NOTIFY lives in `pg-driver.ts`**, reusing the `client`
  exported from `db.ts`. postgres-js owns a dedicated listen connection and auto-reconnects
  + re-LISTENs. A future neon-serverless failback needs a manual reconnect loop there and
  nowhere else (`future-architecture.md`).
