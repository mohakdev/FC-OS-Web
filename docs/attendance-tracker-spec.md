# Attendance Tracker — Spec

**Status:** Draft · 2026-10-26 · nothing built yet — start with P0 (§9).

## 1. Goal
- Replace the activity sheets. One place answers "who is active in this domain / the club?"
- The output is **relative and friendly**. It shows engagement compared with peers and never
  applies a pass/fail cap. Nobody gets publicly labelled inactive.
- Every check-in becomes queryable data. The Performance Tracker will read it later.

## 2. Glossary
| Term | Meaning |
|---|---|
| **Session** | Any occasion where attendance is taken. Stored in `attendance_sessions`. |
| **Meeting** | A session that members are *expected* at. Missing it counts as absence. |
| **Domain meeting** | A meeting with `scope=domain`. Expected: members of that domain. |
| **Club meeting** | A meeting with `scope=global` (full team). Expected: every approved member. |
| **Volunteering** | Event, C2C or Help Desk volunteering. **Bonus only**: it adds to activity and never subtracts. |
| **Event** (future) | An event the club organises, in a future `events` table that becomes the club's single source of truth for events. A volunteering session may later link to it. The name `events` is reserved for that feature. |
| **Lead tier** | lead / co-lead / associate lead (domain-scoped roles). |
| **Leadership** | president / vice president / HRM (global-scoped roles). |

## 3. Roles & permissions (permission-based, per `docs/architecture.md ### RBAC`)
New catalog entries in `src/lib/auth/catalog.ts`, seeded in `src/database/seed.ts` BASE_GRANTS:

| Permission | Lets you | Granted to |
|---|---|---|
| `attendance.session.manage` | create / edit / cancel sessions | lead tier (domain) + leadership (global) |
| `attendance.mark` | scan, add or remove manually, excuse, link cards | lead tier + leadership |
| `attendance.report.view` | see the activity board for a domain or the club | lead tier (own domain) + leadership (club) |

- Scope does the narrowing: a lead acts in their own domain only, and leadership acts everywhere.
- **Domain sessions**: `requireWriteAccess(p)` followed by `canIn(grants, p, domain)`.
- **Club sessions**: any holder of the permission, whether through a domain role or a global
  role (`canAny`). This matches "a lead from any domain or leadership can run a full-team meeting".
- Every member can always see **their own** record. No permission is needed for that.
- advisor and alumni hold nothing and are excluded from expected rosters.
- ⚠️ Seed the new grants **before** deploying (see memory: RBAC lockout).

## 4. Data model (Drizzle, `push` workflow per `docs/pushing-migrations.md`)
Existing tables `activity` and `attendance` are unused stubs. They get reshaped as follows.

**`profiles` += `ra_number text unique`**
- Format validated with Zod (SRM RA: `RA` + 13 digits; confirm the exact format).
- Collected in onboarding and in profile settings. Existing members backfill it.
- Used for manual entry and as the identity the card resolves to.

**`member_cards`** (new)
- Columns: `card_uid text PK`, `profile_id → profiles (cascade)`, `linked_by`, `linked_at`.
- Maps an NFC chip serial to a member. A reissued card is simply a new row.

**`attendance_sessions`** (rename of `activity`)
- Columns: `id`, `title`, `description`, `venue`, `starts_at`, `ends_at?`,
  `kind enum(meeting, event_volunteering, c2c_volunteering, helpdesk_volunteering)`,
  `scope enum(domain, global)`, `domain?`, `created_by → profiles`, `created_at`,
  `cancelled_at?`. A future `event_id → events` column is not added now.
- CHECK: `(scope='domain') = (domain IS NOT NULL)`.

**`attendance`** (reshaped)
- Columns: `session_id → attendance_sessions (cascade)`, `profile_id → profiles (cascade)`,
  `status enum(present, excused)`, `method enum(nfc, manual)`, `marked_by`, `marked_at`.
- UNIQUE `(session_id, profile_id)`. A rescan is idempotent.
- **Absence is derived, never stored.** A member is absent if they were expected and have no row.
  So a late roster change never leaves stale "Absent" rows behind.

**Expected roster for a meeting**: approved, non-read-only members of the cohort (the domain via
`user_roles`, or the whole club) who joined (`profiles.decided_at`) before `starts_at`.
Known limitation: `user_roles` has no timestamp, so a member who switches domain is judged against
their current domain's history.

## 5. Scanning (phone NFC)
- **Capability check on the scan screen:**
  - `"NDEFReader" in window` together with a secure context means NFC is available: show
    **Start scanning**.
  - Otherwise (iOS, desktop, Firefox, NFC off) show a clear "This device can't read ID cards. Use
    Chrome on an Android phone with NFC" message, and keep manual entry available.
- Scanning is started by a user gesture (`reader.scan()`). The permission prompt is handled. A
  `readingerror` shows "Couldn't read card, hold it still / try again".
- **Read path:** the `reading` event gives the card `serialNumber` (UID), which is looked up in
  `member_cards`:
  - Known: the member is marked present at once. The phone vibrates and the member's name and
    photo flash on screen.
  - Unknown: **Link card** prompt. Search a member by name or RA number, confirm, link, mark
    present. Each card is linked once and is instant after that.
- **Why UID-linking rather than reading the RA from the sector:** Web NFC exposes only NDEF records
  and the serial number, never raw MIFARE sector blocks (which need the sector key). A sector read
  needs a native app. That is kept as a Phase 4 option if card linking proves too much friction.
- **Manual fallback, always available:** type an RA number or search a name, then mark present.
  Stored with `method=manual`.
- **Several scanners on one session:** marks go through Server Actions → `notifyRealtime` → every
  open scan screen and board updates live (existing SSE realtime).
- Offline is out of scope for v1. Scans need a connection, and the UI shows an error on failure.

## 6. Screens (shadcn/ui only, under `src/app/dashboard/attendance-tracker/`)
1. **Home** `/`
   - Tabs: Today · Upcoming · Past.
   - Filters by domain and kind.
   - A **New session** button (if the user holds `session.manage` anywhere).
   - A regular member sees **My attendance** instead: their status, meeting rate, last seen,
     volunteering count and recent sessions.
2. **Session** `/sessions/[id]`
   - Session details and a big **Scan** button.
   - A live checked-in list, plus "Not here yet" (expected and missing) for meetings.
   - Row actions: excuse, remove, manual add. Edit or cancel the session.
3. **Activity board** `/activity`
   - A Domain tab (one per domain the viewer can see) and a Club tab (leadership).
   - A member table: status badge, meeting rate, trend arrow, last seen, a dot strip of the last
     10 meetings, and volunteering count.
   - Sort and filter by status.
   - A **Matrix view** (members × sessions, like the old sheet).
   - **Export CSV**.
4. **Profile**: an RA number field in onboarding and profile settings.

## 7. Activity model (the "relative" output)
The default window is the member's **last 10 expected meetings** plus volunteering in the **last
90 days**. Counting meetings rather than days keeps domains with different meeting cadences
comparable. All tunables live in one constants file.

- **Meeting rate** `R` = attended ÷ (expected − excused) within the window.
- **Engagement score** = `round(100·R) + min(5·V, 20)`, where `V` is the number of volunteering
  sessions. Volunteering can only raise the score.
- **Status** (checked in this order):
  1. **New**: fewer than 3 expected meetings so far. Not enough data, so never flagged.
  2. **Inactive**: missed the last 4 expected meetings in a row **and** no volunteering in the
     last 30 days.
  3. **Active**: `R ≥ 0.75`, **or** score ≥ the cohort median. This is the relative part: a domain
     that meets rarely isn't penalised.
  4. **Drifting**: everything else (a nudge, not a flag).
- **Trend**: the rate over the last 5 meetings compared with the 5 before that (↑ ↓ →).
- **Cohort**: the domain on a domain tab, and the club on the club tab.
- Computed on read in SQL and TS. No stored scores, so nothing goes stale.

## 8. Non-goals (v1)
- The club events calendar (the future `events` table).
- Self check-in, QR codes and geofencing.
- Offline scanning.
- Notifications to inactive members.
- Performance Tracker scoring.

## 9. Rollout phases
- **P0 — NFC spike (do first, about 1 hour).** Small test page. Tap real SRM ID cards on 2–3
  Android phones in Chrome and confirm three things:
  - `reading` fires
  - `serialNumber` is stable for each card
  - which phones fail (some non-NXP NFC chips can't handle MIFARE Classic)

  This decides whether UID-linking is enough.
- **P1 — Data.** Schema changes and `push` on dev. Catalog and seed grants. Sample dev sessions
  (domain meetings, club meetings and volunteering across the last few weeks) with fake
  attendance, so the board has data. Prod only after review: seed grants, then deploy.
- **P2 — Sessions + scanning.** CRUD, the scan screen, card linking, manual entry, realtime.
- **P3 — Activity board.** Board, matrix, CSV, My attendance, RA number in profile and onboarding.
- **P4 (conditional).** A native Android reader for RA from the card sector, if P0 or real use
  shows card linking is too much friction.

## 10. Open questions
1. Exact RA number format (is `RA` + 13 digits right?).
2. Is a card UID read on the phone stable across taps? (Answered by P0.)
3. Can a lead from domain X mark attendance at domain Y's meeting? Current answer: no; only club
   meetings are open to any lead tier.
4. Are the window and threshold defaults fine (10 meetings, 4-miss inactive, 0.75 rate)?
