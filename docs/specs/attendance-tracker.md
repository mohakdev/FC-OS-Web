# Attendance Tracker — Spec

> One place answers "who is active in this domain / the club?". Members tap their SRM ID
> card on a phone (Web NFC) at a meeting; FC OS records attendance and derives activity.
> Lives at `/dashboard/attendance-tracker`. Sister data source for the Performance Tracker.

**Status:** Spec · revised 2026-11-13 · nothing built yet.

> **2026-11-15 — Forum changes the data model below.** Internal meetings now live in Forum's
> `forum_events` table (`docs/architecture.md` `### Forum`): kinds `domain_meeting` /
> `club_meeting`, audience derived from kind + domain (leadership is expected at every domain
> meeting). The `activity` / `attendance` stubs were dropped. When this tracker is built,
> meeting sessions (§4 `attendance_sessions`) are `forum_events` rows and attendance references
> them; creating meetings (§8 "New session") is Forum's job, not this tool's. External
> events are Canon's, not Forum's, so any external-event / volunteer attendance would hang
> off `canon_events` and stay separate from member meeting attendance. Supersedes the 2026-10-26 draft
(`docs/attendance-tracker-spec.md`, now a pointer stub).

## Decisions behind this revision (2026-11-13)

We tested real SRM ID cards (TagInfo + MIFARE Classic Tool dumps) and settled four product
questions. Both shaped the model below.

1. **NFC reality.** SRM cards are MIFARE Classic 4K clones. The RA number *is* stored in
   sector 0 as ASCII (default key `FFFFFFFFFFFF`, split around a `PATRON__` tag), but
   **Web NFC exposes only the card UID + NDEF records, never raw sectors.** So the web tool
   links a card's **UID → member**; it never reads the RA off the card. Reading the RA would
   need a native Android app (`MifareClassic` API) — kept as a conditional Phase 4. Two more
   reasons UID is the identity, not card-stored RA: writing an NDEF record (e.g. a URL) to a
   card **wipes** the RA bytes, and the default keys make the RA trivially spoofable.
2. **Identity: RA required for all.** Every member must have an RA on file. Existing approved
   members have none yet, so they hit a **one-time blocking RA gate on next login**.
3. **Unknown card at the door → self-link.** A member links their **own** card once, from
   their profile, on Android Chrome. The door scan recognises only pre-linked cards. Markers
   never link cards mid-rush; unlinked members are marked via the manual (RA/name) fallback.
4. **Three meeting types** — club, domain, associate-leads — each with its own expected roster.

## 1. Goal
- Replace the activity sheets. One place answers "who is active in this domain / the club?".
- Output is **relative and friendly**: engagement vs peers, no pass/fail cap, nobody publicly
  labelled inactive.
- Every check-in is queryable data the Performance Tracker will read later.

## 2. Glossary
| Term | Meaning |
|---|---|
| **Session** | Any occasion attendance is taken. Row in `attendance_sessions`. |
| **Meeting** | A session members are *expected* at. Missing it = absence. One of 3 kinds below. |
| **Club meeting** | Expected: every approved, non-read-only member. |
| **Domain meeting** | Expected: members of that domain. |
| **Associate-leads meeting** | Expected: everyone holding the `associate lead` role. |
| **Volunteering** | Event / C2C / Help-Desk. **Bonus only** — raises activity, never counts as absence. |
| **Lead tier** | lead / co-lead / associate lead (domain-scoped roles). |
| **Leadership** | president / vice president / HRM (global-scoped roles). |
| **Card** | NFC chip on an SRM ID. Identified by its UID; linked once to a member. |

## 3. Roles & permissions (permission-based, `docs/architecture.md ### RBAC`)
New catalog entries in `src/lib/auth/catalog.ts`, granted in `src/database/seed.ts` `BASE_GRANTS`:

| Permission | Lets you | Granted to |
|---|---|---|
| `attendance.session.manage` | create / edit / cancel sessions | lead tier (domain) + leadership (global) |
| `attendance.mark` | scan, manual add/remove, excuse | lead tier + leadership |
| `attendance.report.view` | see the activity board | lead tier (own domain) + leadership (club) |

- Scope narrows: a lead acts in their own domain; leadership everywhere.
- **Domain meeting:** `requireWriteAccess(p)` then `canIn(grants, p, domain)`.
- **Club & associate-leads meeting:** any holder via domain or global role (`canAny`) — "a lead
  from any domain or leadership can run it".
- Every member always sees **their own** record — no permission needed.
- advisor / alumni hold nothing, excluded from expected rosters.
- Linking your **own** card needs no attendance permission (any approved member).
- ⚠️ Seed grants **before** deploying or the org locks out (see RBAC lockout note in
  `docs/production-runbook.md`). superadmin auto-gets new permissions on reseed.

## 4. Data model (Drizzle, `push` workflow; `db.transaction` for multi-statement writes)
The stub tables `activity` + `attendance` (already in `src/database/schemas/index.ts`) are
reshaped. Add any new schema file to that barrel. The stack is **postgres-js** now, so
multi-statement writes use `db.transaction(...)` — not the old `db.batch` (that note in
`docs/architecture.md` is stale).

**`profiles` += `ra_number text unique`** (nullable in DB; app-enforced via the RA gate)
— **BUILT 2026-11-15** (see `docs/architecture.md` `### Auth + onboarding/approval flow`).
- Zod format: `RA` + 13 digits (`/^RA\d{13}$/`). Error message states the **format only**, never
  echoes an ID (pattern: `netIdSchema` in `src/lib/validation/onboarding.ts`).
- Collected at onboarding (new field) and via the one-time RA gate for existing members.

**`member_cards`** (new)
- `card_uid text PK`, `profile_id → profiles (cascade) notNull`, `linked_by → profiles (set null)`,
  `linked_at timestamptz default now`.
- Maps a card UID → member. A member may have several over time (reissues); "replace card"
  deletes their prior rows. `linked_by` = self for self-link.

**`attendance_sessions`** (rename of `activity`)
- `id`, `title`, `description?`, `venue?`, `starts_at timestamptz notNull`, `ends_at?`,
  `kind enum(club_meeting, domain_meeting, assoc_leads_meeting, event_volunteering,
  c2c_volunteering, helpdesk_volunteering)`, `domain? → domains`, `created_by → profiles (set null)`,
  `created_at`, `cancelled_at?`.
- CHECK: `(kind = 'domain_meeting') = (domain IS NOT NULL)` — domain set iff domain meeting
  (precedent: `check()` in `canon_events.ts`).
- A future `event_id → events` column is not added now.

**`attendance`** (reshaped)
- `session_id → attendance_sessions (cascade) notNull`, `profile_id → profiles (cascade) notNull`,
  `status enum(present, excused)`, `method enum(nfc, manual)`, `marked_by → profiles (set null)`,
  `marked_at`.
- UNIQUE `(session_id, profile_id)` — a rescan is idempotent (upsert).
- **Absence is derived, never stored**: expected ∧ no row = absent. A late roster change leaves
  no stale "absent" rows behind.

**Expected roster per meeting kind** (approved, non-read-only, `decided_at < starts_at`):
- `club_meeting` → all such members.
- `domain_meeting` → members whose `user_roles` include that domain.
- `assoc_leads_meeting` → members holding role `associate lead`.
- volunteering kinds → **no roster** (bonus only, never absence).
- Known limit: `user_roles` has no history, so a domain-switcher is judged against their current domain.

## 5. RA gate (one-time, blocking) — BUILT 2026-11-15

> As built: route is `/onboarding/details` (not `/onboarding/ra`) and also hosts the optional
> picture/quote/links; advisor/alumni (zero real grants) are **exempt** — this overrides
> "RA required for all" in decision 2; pending applicants are not asked (caught after
> approval); members can't change their RA, `member.ra.edit` (superadmin) can replace it.
> The text below is the original design.

- `src/app/dashboard/layout.tsx` already redirects `no-profile → /onboarding` and `!approved →
  /pending`. Add: approved **and** `ra_number IS NULL` → `redirect("/onboarding/ra")`.
- The new page reuses the onboarding form pattern (plain `useState` + `useTransition` → server
  action; **no react-hook-form** in this repo). Action `setRaNumber`: Zod-validate, uniqueness
  check, `dbActions.setRaNumber(profileId, ra)`, then `redirect` to the dashboard.
- New members: `ra_number` added to `onboardingSchema` + `onboarding-form.tsx`, so they never
  hit the gate.

## 6. Self-link your card (new profile surface)
The profile page is read-only today, so this is a net-new surface.
- Profile page gets a **"My ID card"** section.
- Android Chrome + secure context: **Link my card** → `reader.scan()` → `reading` event UID →
  server action `linkMyCard(uid)` → upsert `member_cards` with `profile_id = self`,
  `linked_by = self`. Show the linked state + a **Replace card** action (deletes the member's
  prior rows, links the new UID).
- Other devices (iOS / desktop / Firefox / NFC off): explain "link from Android Chrome with NFC".
  Not blocking.
- If a UID is already linked to **another** member, refuse with a clear message (card belongs to
  someone else / was reassigned → leadership resolves).

## 7. Scanning (door kiosk, foreground only)
- **Not a background service.** Web NFC reads only while the page is open, focused and the screen
  is on. One phone = one door kiosk for the session; it can't scan in the background or while locked.
- Capability check: `"NDEFReader" in window` + secure context → **Start scanning**; otherwise a
  clear fallback message, with manual entry always available.
- Scanning is started by a user gesture (`reader.scan()`); `readingerror` → "hold it still / try again".
- **Read path:** `reading` → `serialNumber` (UID) → look up `member_cards`:
  - **Known UID** → mark present (`method=nfc`), vibrate, flash name + photo.
  - **Unknown UID** → "card not linked — ask them to link it in their profile, or add them
    manually". **No door linking.**
- **Manual fallback (always):** search by RA or name → mark present (`method=manual`). Covers
  unlinked members and non-Android markers.
- **Multi-scanner:** marks → Server Action → `notifyRealtime` → every open scan screen + board
  refreshes live. New realtime scope `{ scope: "attendance", sessionId }` (extend the union in
  `src/lib/realtime/notify.ts`); same pattern as opus `revalidateBoard`.
- Offline scanning is out of scope for v1.

## 8. Screens (shadcn/ui only, `src/app/dashboard/attendance-tracker/`; replaces the stub `page.tsx`)
Mirror Opus/Canon: `force-dynamic` RSC pages, `getAccessContext()` guard, data via
`src/utils/attendanceDbActions.ts`, client parts in `_components/`, a `<Refresher scope="attendance" />`.
1. **Home `/`** — Tabs Today · Upcoming · Past; filter by domain + kind; **New session** (if the
   user holds `attendance.session.manage` anywhere). A regular member sees **My attendance**
   (status, meeting rate, last seen, volunteering count, recent sessions).
2. **Session `/sessions/[id]`** — details + a big **Scan** button; a live checked-in list and
   "Not here yet" (expected − present) for meetings; row actions excuse / remove / manual add;
   edit or cancel the session.
3. **Activity board `/activity`** — a Domain tab per domain the viewer can see + a Club tab
   (leadership); a member table with status badge, meeting rate, trend arrow, last seen, a
   10-meeting dot strip and volunteering count; sort/filter by status; a **Matrix view**
   (members × sessions, like the old sheet); **Export CSV** (net-new — no export code exists yet).
   Reuse the table + search/filter/paginate pattern from `member-directory-client.tsx`.
4. **Profile** — RA (via the gate / onboarding) + the "My ID card" self-link (§5, §6).

## 9. Activity model (the "relative" output)
Window = the member's **last 10 expected meetings** + volunteering in the **last 90 days**.
Counting meetings rather than days keeps domains with different cadences comparable. All tunables
live in one constants file.
- **Meeting rate** `R` = attended ÷ (expected − excused) within the window.
- **Engagement score** = `round(100·R) + min(5·V, 20)`, where `V` is the volunteering count.
  Volunteering can only raise it.
- **Status** (checked in order):
  1. **New** — fewer than 3 expected meetings so far; never flagged.
  2. **Inactive** — missed the last 4 expected meetings in a row **and** no volunteering in 30 days.
  3. **Active** — `R ≥ 0.75`, **or** score ≥ the cohort median (the relative part: a domain that
     meets rarely isn't penalised).
  4. **Drifting** — everything else (a nudge, not a flag).
- **Trend** — the rate over the last 5 meetings vs the 5 before (↑ ↓ →).
- **Cohort** — the domain on a domain tab, the club on the club tab. Associate-leads meetings fold
  into a member's club and domain history.
- Computed on read in SQL + TS. No stored scores, so nothing goes stale.

## 10. Non-goals (v1)
The club events calendar (future `events` table) · self check-in / QR codes / geofencing ·
offline scanning · notifications to inactive members · Performance Tracker scoring ·
the native RA-sector reader (Phase 4).

## 11. Rollout phases
- **P1 — Data + RA gate.** Schema changes + `push` on dev; catalog + seed grants; `ra_number`,
  the RA gate and the onboarding field; sample sessions/attendance so the board has data. Prod
  only after review (seed grants first).
- **P2 — Self-link + sessions + scanning.** `member_cards`, profile self-link, session CRUD, the
  scan screen, manual entry, realtime.
- **P3 — Activity board.** Board, matrix, CSV, My-attendance.
- **P4 (conditional).** A native Android reader for RA-from-sector, only if UID linking proves too
  much friction.

## 12. Open questions
1. RA format confirmed `RA` + 13 digits (`RA2511026010478` verified on a real card). Any
   department/year where it differs?
2. Is a card UID stable across taps? (One quick re-tap in MCT confirms; expected yes.)
3. Associate-leads meeting: expected = role `associate lead` only, or lead + co-lead too?
4. Are the window/threshold defaults fine (10 meetings, 4-miss inactive, 0.75 rate)?
