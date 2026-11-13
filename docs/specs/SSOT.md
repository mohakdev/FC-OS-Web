# Canon — the club's Single Source of Truth

> "Is it canon?" = is it official? Canon is where the official answer lives.
> Sister tool to **Opus** (work). Lives at `/dashboard/canon`.

**Status:** v1 built on `feat/canon` (2026-11-13). Implementation notes: `docs/architecture.md` → `### Canon`.

## Why

The club has a comms gap: event facts (dates, venue, who's in charge) live in
chats and people's heads. Canon makes one page per event the official answer.
Later: one page per domain, and one for the club.

## Scope

- **v1: Events only.**
- Later: Domain SSOT, Club SSOT. The v1 data model and RBAC should not block these.

## RBAC

Authorize on permissions, never role names (see `docs/architecture.md` → `### RBAC`).

| Action | Who | Permission |
|---|---|---|
| Read any Canon page | Every approved member (incl. advisor/alumni) | none (read is open) |
| Create / delete an event | HRM, VP, President | `canon.event.manage` (global) |
| Edit / publish an event | Leadership **+ that event's SPOCs** | `canon.event.manage`, or `canon.event.edit.own` + SPOC on that event (SPOCs can't change SPOCs or delete) |
| Write a Domain SSOT (later) | Domain lead + associate lead | `canon.domain.manage` (domain-scoped) |
| Write the Club SSOT (later) | HRM, VP, President | `canon.club.manage` (global) |

- New permissions must be seeded **before** deploy (see memory: seed before deploying or you lock out the org).
- Superadmin holds all permissions automatically.

## Event fields

| # | Field | Shape | Notes |
|---|---|---|---|
| 1 | Name | text, required, max 80 chars | Longest known: "Entrepreneurship Bootcamp XII" (29). |
| 2 | SPOCs | 1..n members | Picked from Member Directory (`profiles`). Phone comes from `profiles.phone`. |
| 3 | Dates | 3 typed ranges | See [Dates](#dates). |
| 4 | Venues | 0..n rows | See [Venues](#venues). |
| 5 | Type | `paid` / `unpaid` + optional fee (₹, integer) | Participant registration fee. Badge: `Paid · ₹199`, or `Paid` when no amount, or `Free`. |
| 6 | Category | 1 from an editable list | Seeded: Ideathon, Hackathon, Startupathon, InterClub. Leadership can add/rename/remove (no schema change). |
| 7 | Short description | text, max ~500 chars | Plain text. |
| 8 | Event flow | ordered phases | Each phase: title + markdown body. Add / remove / reorder. |
| 9 | Participation | `individual` / `team` / `both`, required (default individual) | Team and Both need a min **and** max team size: 2 ≤ min ≤ max ≤ 10 (Zod + DB CHECK). For Both, sizes apply to team entries; solo entries are also allowed. Badge: `Individual`, `Team · 2–4`, `Team or solo · teams of 2–4`. |
| — | Footer metadata | `created_at`, `updated_at`, `updated_by` | See [Footer](#footer). |

### Dates

Three date types, each a **range** (start required, end optional = single day),
each with its **own** status badge:

| Type | Example |
|---|---|
| Event | 14 Feb 2027 – 16 Feb 2027 |
| Marketing (C2Cs, helpdesks…) | 01 Feb 2027 – 13 Feb 2027 |
| Registration | 01 Feb 2027 – 12 Feb 2027 |

Status per row: `tentative` (amber badge, text "Tentative") or `confirmed` (green badge, text "Confirmed").
Display format: `DD Mon YYYY` (e.g. `14 Feb 2027`).

### Venues

0..n venue rows per event, so it handles one venue, several venues, or a different venue per day.

Each row: `name` (text) + optional `day(s)` it applies to + one status on an ordered ladder:

| Status | Color | Meaning |
|---|---|---|
| Not booked | red (destructive) | No booking yet / fell through |
| Unconfirmed | amber (warning) | Requested, not confirmed |
| Confirmed | blue (info) | Confirmed by venue owner, not formally booked |
| Booked | green (success) | Booked, done |

### Footer

```
Created at: 13 Nov 2026; 04:12 PM    Last updated by: [person] at 13 Nov 2026; 06:40 PM (2 hours ago)
```

- Times in IST, 12-hour with AM/PM.
- Relative time ("x mins/hours/weeks/months/yrs ago") is computed **once, when the page is opened** (server render). It does not tick live.
- `updated_by` links to the member.

### Lifecycle

- `draft` → `published`. Drafts are visible only to people who can edit them (leadership + that event's SPOCs).
- Publishing is one click by any editor. It can be unpublished back to draft.
- No manual archive: "past" is derived from the event end date.

### Change history

- Every save writes one revision row: who, when, which fields changed.
- v1 shows only the footer. A "History" view can come later on top of the stored rows.

### Live updates

- Saves call the existing `notifyRealtime(...)`. Open Canon pages refresh live through the app-wide SSE hub. No email in v1.

## Index page (`/dashboard/canon`)

- Cards for published events (plus the viewer's own drafts, marked `Draft`).
- Grouped **Ongoing → Upcoming → Past**, computed from event dates. Events with no event date sit in Upcoming.
- Each card: name, category + type badges, event date range with its status badge.
- "New event" button only for `canon.event.manage` holders.
- Add Canon to the sidebar (`dashboard-nav.ts`).

## Look and feel

Page order, top to bottom:

1. **Name** as the H1.
2. **Badges**: category + type (paid/unpaid) + participation.
3. **SPOCs**, one per line, *italic*, each with a phone icon (`tel:` link).
4. **Dates** as a shadcn `Table`: rows = Event / Marketing / Registration; columns = Start, End, Status badge.
5. **Venues**, each with its status badge (and day(s) when set).
6. **Short description.**
7. **Event flow**: phases in a shadcn **Trace** (`bunx shadcn@latest add trace`, radix variant to match `radix-nova`). Each phase = `TraceCollapsible` line (numbered icon + phase title) whose content is a `Card` holding the markdown body.
8. **Footer** (see above).

### Editing = the same page, not a form

- Edit mode renders the **same layout** as the read view (WYSIWYG, Notion-like).
- Inputs are **borderless / ghost** (no border, no background until focus) and styled as the text they replace: the H1 input looks like the H1, and so on.
- The borderless input style is scoped to Canon only; global shadcn `Input` stays untouched (variant or className on the Canon editor).
- Badges become clickable dropdowns (`DropdownMenu`/`Select`) in edit mode.
- SPOC picker = `Command` popover over Member Directory.

### Color rules

- Semantic everywhere: red = danger/not done, amber = pending/tentative, blue = info/in-progress, green = done/confirmed.
- Use theme tokens (CSS variables) so every theme (light/dark) keeps contrast. No hard-coded hex in components.
- Category and type badges are neutral (no semantic meaning), so they use `secondary`/`outline`.

## Storage decision

**Structured columns in Postgres (Drizzle), rendered by React.** Not MDX.
Reasons: validation per field, consistent badges and date formats, and no runtime code
execution from user content. Phase bodies are markdown (rendered safely, no raw HTML).

## Data model

| Table | Holds |
|---|---|
| `canon_events` | name, category_id, is_paid, fee, short_desc, status (draft/published), created_at/by, updated_at/by |
| `canon_event_dates` | event_id, kind (event/marketing/registration), start, end?, status (tentative/confirmed) |
| `canon_event_venues` | event_id, position, name, days?, status (not_booked/unconfirmed/confirmed/booked) |
| `canon_event_spocs` | event_id, profile_id, position |
| `canon_event_phases` | event_id, position, title, body (markdown) |
| `canon_categories` | name, position (seeded with 4) |
| `canon_event_revisions` | event_id, actor, at, changed_fields |

Writes go through one server action per save, in one `db.transaction` (postgres-js) with an optimistic lock on `updated_at`.

## Out of scope for v1

- Domain SSOT and Club SSOT pages.
- History view UI (data is stored).
- Email/push notifications.

## Decision log

| Date | Decision |
|---|---|
| 2026-11-13 | Name: **Canon**. |
| 2026-11-13 | Structured form, not MDX. Editor must not feel like a form: borderless inputs, same layout as read view. |
| 2026-11-13 | SPOCs can edit their own event; leadership creates and assigns SPOCs. |
| 2026-11-13 | Dates: 3 ranges, each with its own Tentative/Confirmed badge. |
| 2026-11-13 | Venue: one ordered status ladder per row (Not booked → Unconfirmed → Confirmed → Booked); rows support per-day venues. |
| 2026-11-13 | Footer: created at + last updated by/at + relative time computed on open. |
| 2026-11-13 | Event flow uses shadcn Trace (radix variant) + Cards. |
| 2026-11-13 | Category: editable list, seeded with the 4. |
| 2026-11-13 | Paid events: optional ₹ fee shown on the badge. |
| 2026-11-13 | History: footer in v1 + revision rows stored for a later History view. |
| 2026-11-13 | Notifications: live refresh only (existing realtime), no email. |
| 2026-11-13 | Draft → Published lifecycle; index grouped Ongoing / Upcoming / Past by date. |
| 2026-11-13 | Participation type added: required; Team/Both need min+max (2–10); for Both, sizes apply to teams only; shown as a neutral badge. |
