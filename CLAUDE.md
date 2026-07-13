# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

FC OS is the **Founders Club operating system** — one Next.js app that houses every
internal club tool behind a single dashboard and auth/approval gate. Tools live under
`src/app/dashboard/`: **MoM**, **Attendance Tracker**, **FC TV CMS**, **Performance
Tracker**, **Member Directory** (approvers edit roles/domains + remove members),
**Member Requests** (HRM admin), and **Opus** — the PM
tool that is the current focus of active development. Users are
club members.

## Commands

```bash
bun install              # Bun is the package manager + lockfile source of truth
bun run dev              # next dev
bun run build            # next build
bun run lint             # biome check  (lint)
bun run format           # biome format --write
bun run seed             # tsx src/database/seed.ts

bunx drizzle-kit generate --config drizzle.config.ts   # generate migration SQL (for the record)
bunx drizzle-kit push     --config drizzle.config.ts   # apply schema to DB (NOT `migrate` — see below)
```

- DB syncs via **`push`**, not `migrate` (no `__drizzle_migrations` table). See
  `docs/pushing-migrations.md` before touching the schema.

- **Never commit** `package-lock.json`, `pnpm-lock.yaml`, or `yarn.lock` (Bun only).
- Lint/format is **Biome**, not ESLint/Prettier.

## Memory graph (read before exploring, update after coding)

A persistent knowledge graph of this whole repo lives in **`graphify-out/`** —
`graph.json` (910 nodes / 59 communities), `GRAPH_REPORT.md` (god nodes, community
map, surprising cross-doc links), `graph.html` (interactive).

- **Before** spelunking files to answer a "how/where/why does X work" question, query the
  graph first: `graphify query "<question>"` (or `/graphify query …`). It's the map —
  faster than re-reading source. God nodes: `cn()`, `getAccessContext()`,
  `requireWriteAccess()`, `Button()`.
- **After** you change code, **keep the graph current** — it's the single memory of record:
  - Code edits land automatically: the installed **post-commit hook** re-runs AST
    extraction + rebuilds `graph.json`/`GRAPH_REPORT.md` on every `git commit`.
  - Doc/image edits (`docs/`, `*.md`, `public/`) are **not** picked up by the hook —
    run `/graphify --update` (or `graphify update`) yourself after changing them.
  - Hook controls: `graphify hook status | install | uninstall`.

## Reference docs (keep this file lean — link, don't inline)

- **Database / migrations workflow**: `docs/how-to-database.md`, `docs/pushing-migrations.md`
- **Next.js 16 specifics**: `AGENTS.md` + `node_modules/next/dist/docs/` — this is a
  newer Next than your training data (e.g. `middleware.ts` is now `proxy.ts`).
- **Self-hosting (this branch)**: `docs/production-runbook.md` — live deploy topology, ops
  scripts (`scripts/redeploy.sh`, `scripts/sync-neon-to-local.sh`), procedures, gotchas.
  Bring-up: `docs/deploying-self-hosted.md`. Failback design: `docs/future-architecture.md`.

## Architecture

Stack: Next.js 16 (App Router, RSC) · React 19 · Drizzle ORM on Neon Postgres · Neon
Auth (Better Auth) · Tailwind v4 · Zod v4.

Full detail lives in **`docs/architecture.md`** — read the relevant `###` section before
touching that area:

- **`### Auth + onboarding/approval flow`** — passwordless OTP, `proxy.ts` gating, the
  two-stage onboarding/approval state machine, and the `force-dynamic` requirement.
- **`### RBAC`** — authorize on **permissions, never role names**. `roles` +
  `permissions` + `role_permissions` (the editable grid) + `user_roles`; grants resolve by
  `roles.scope` (global = org-wide, domain = that domain only), so `canIn()` narrows to a
  domain for free. Guard every mutating action with `requireWriteAccess(permission)`
  (signed-in + approved + holds it), then `canIn(...)` once the domain is known. Grants are
  additive with no deny rules — read-only roles hold nothing and must stay exclusive. Admin
  grid at `/dashboard/settings/roles`.
- **`### Data layer`** — schema-per-file convention, `dbActions.ts` trust boundary,
  `db.batch()` (no interactive transactions on neon-http).
- **`### App structure`** — gated dashboard shell, `dashboard-nav.ts`, Opus.
- **`### Opus`** — per-domain kanban data model + the built workspace: routes under
  `src/app/dashboard/opus/`, data layer in `src/utils/opusDbActions.ts`, authz in
  `src/lib/opus/permissions.ts` (`canManageDomain` = manager-only full edits vs
  `canChangeTaskStatus` = assignees may set status on their own tasks/subtasks), shared
  presentation in `src/lib/opus/format.ts` — `statusFraction`/`StatusIcon` fill the
  progress-ring by rank among dynamic statuses, and any status flagged
  `opus_statuses.ring_full` renders a complete ring (data-driven; replaces the old
  hardcoded Done/Cancelled special-casing).
- **`### Realtime`** — app-wide live updates via Postgres `LISTEN/NOTIFY` (channel
  `fc_realtime`) → one `globalThis`-guarded process-wide hub (`src/lib/realtime/server.ts`)
  → SSE route `src/app/api/realtime/route.ts` (nodejs, auth-gated, 25s heartbeat) → single
  `EventSource("/api/realtime")` per tab in `src/components/realtime/realtime-provider.tsx`
  → debounced `router.refresh()`. Server actions emit via `notifyRealtime(...)` at existing
  revalidate choke-points (opus `revalidateBoard`/`revalidateManage`, member actions).
  **All driver-specific listen/notify is isolated to `src/lib/realtime/pg-driver.ts`** — the
  only file to touch for the future neon-serverless failback (it needs manual reconnect;
  postgres-js auto-reconnects). No new env var: the EventSource URL is same-origin relative.

## UI components

**Use only shadcn/ui components for the entire app.** Build UI from primitives in
`src/components/ui/` (Card, Button, Badge, Avatar, Sidebar, ScrollArea, DropdownMenu,
etc.). Need a component that isn't installed? Add it with `bunx shadcn@latest add <name>`
— do not hand-roll or pull in another component library. Config: `components.json`
(style `radix-nova`, icons `lucide-react`); the shadcn MCP server is wired in `.mcp.json`
for component lookup/examples. Non-UI libs for behavior are fine when no
shadcn equivalent exists (e.g. `@dnd-kit` for drag-and-drop).
