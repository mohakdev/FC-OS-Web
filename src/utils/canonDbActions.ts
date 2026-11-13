// Canon (club SSOT) DB actions / query helpers. Same trust-boundary convention
// as `dbActions.ts` / `opusDbActions.ts`: validation + access control live in
// the calling Server Action; these helpers own the SQL and do no authz.

import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { db } from "../database/db";
import { canonCategories } from "../database/schemas/canon_categories";
import { canonEventDates } from "../database/schemas/canon_event_dates";
import { canonEventPhases } from "../database/schemas/canon_event_phases";
import { canonEventRevisions } from "../database/schemas/canon_event_revisions";
import { canonEventSpocs } from "../database/schemas/canon_event_spocs";
import { canonEventVenues } from "../database/schemas/canon_event_venues";
import { canonEvents } from "../database/schemas/canon_events";
import { profiles } from "../database/schemas/profiles";
import type {
  DateKind,
  DateStatus,
  EventStatus,
  Participation,
  VenueStatus,
} from "../lib/canon/constants";
import type { EventSaveData } from "../lib/canon/schema";

// --- types -----------------------------------------------------------------

export type CanonPerson = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
};

export type CanonDate = {
  kind: DateKind;
  startDate: string;
  endDate: string | null;
  status: DateStatus;
};

export type CanonVenue = {
  name: string;
  days: string | null;
  status: VenueStatus;
};

export type CanonPhase = { title: string; body: string };

export type CanonCategoryRow = { id: string; name: string; position: number };

export type CanonEventCard = {
  id: string;
  name: string;
  categoryName: string;
  isPaid: boolean;
  fee: number | null;
  participation: Participation;
  teamMin: number | null;
  teamMax: number | null;
  status: EventStatus;
  spocIds: string[];
  eventDate: {
    startDate: string;
    endDate: string | null;
    status: DateStatus;
  } | null;
};

export type CanonEventDetail = {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  isPaid: boolean;
  fee: number | null;
  participation: Participation;
  teamMin: number | null;
  teamMax: number | null;
  shortDesc: string;
  status: EventStatus;
  spocs: CanonPerson[];
  dates: CanonDate[];
  venues: CanonVenue[];
  phases: CanonPhase[];
  createdAt: Date;
  createdBy: { firstName: string; lastName: string } | null;
  updatedAt: Date;
  updatedBy: { id: string; firstName: string; lastName: string } | null;
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Exec = typeof db | Tx;

// --- reads -----------------------------------------------------------------

/** Every event as an index card. Visibility (drafts) is filtered by the caller. */
export const listCanonEvents = async (): Promise<CanonEventCard[]> => {
  const [rows, spocs, eventDates] = await Promise.all([
    db
      .select({
        id: canonEvents.id,
        name: canonEvents.name,
        categoryName: canonCategories.name,
        isPaid: canonEvents.isPaid,
        fee: canonEvents.fee,
        participation: canonEvents.participation,
        teamMin: canonEvents.teamMin,
        teamMax: canonEvents.teamMax,
        status: canonEvents.status,
      })
      .from(canonEvents)
      .innerJoin(
        canonCategories,
        eq(canonCategories.id, canonEvents.categoryId),
      ),
    db
      .select({
        eventId: canonEventSpocs.eventId,
        profileId: canonEventSpocs.profileId,
      })
      .from(canonEventSpocs),
    db
      .select({
        eventId: canonEventDates.eventId,
        startDate: canonEventDates.startDate,
        endDate: canonEventDates.endDate,
        status: canonEventDates.status,
      })
      .from(canonEventDates)
      .where(eq(canonEventDates.kind, "event")),
  ]);

  const spocsBy = new Map<string, string[]>();
  for (const s of spocs) {
    spocsBy.set(s.eventId, [...(spocsBy.get(s.eventId) ?? []), s.profileId]);
  }
  const dateBy = new Map(eventDates.map((d) => [d.eventId, d]));

  return rows.map((r) => {
    const d = dateBy.get(r.id);
    return {
      ...r,
      spocIds: spocsBy.get(r.id) ?? [],
      eventDate: d
        ? { startDate: d.startDate, endDate: d.endDate, status: d.status }
        : null,
    };
  });
};

const loadEventDetail = async (
  exec: Exec,
  id: string,
): Promise<CanonEventDetail | null> => {
  const [event] = await exec
    .select({
      id: canonEvents.id,
      name: canonEvents.name,
      categoryId: canonEvents.categoryId,
      categoryName: canonCategories.name,
      isPaid: canonEvents.isPaid,
      fee: canonEvents.fee,
      participation: canonEvents.participation,
      teamMin: canonEvents.teamMin,
      teamMax: canonEvents.teamMax,
      shortDesc: canonEvents.shortDesc,
      status: canonEvents.status,
      createdAt: canonEvents.createdAt,
      createdById: canonEvents.createdBy,
      updatedAt: canonEvents.updatedAt,
      updatedById: canonEvents.updatedBy,
    })
    .from(canonEvents)
    .innerJoin(canonCategories, eq(canonCategories.id, canonEvents.categoryId))
    .where(eq(canonEvents.id, id))
    .limit(1);
  if (!event) return null;

  const peopleIds = [event.createdById, event.updatedById].filter(
    (v): v is string => Boolean(v),
  );

  const [spocs, dates, venues, phases, people] = await Promise.all([
    exec
      .select({
        id: profiles.id,
        firstName: profiles.firstName,
        lastName: profiles.lastName,
        phone: profiles.phone,
      })
      .from(canonEventSpocs)
      .innerJoin(profiles, eq(profiles.id, canonEventSpocs.profileId))
      .where(eq(canonEventSpocs.eventId, id))
      .orderBy(asc(canonEventSpocs.position)),
    exec
      .select({
        kind: canonEventDates.kind,
        startDate: canonEventDates.startDate,
        endDate: canonEventDates.endDate,
        status: canonEventDates.status,
      })
      .from(canonEventDates)
      .where(eq(canonEventDates.eventId, id)),
    exec
      .select({
        name: canonEventVenues.name,
        days: canonEventVenues.days,
        status: canonEventVenues.status,
      })
      .from(canonEventVenues)
      .where(eq(canonEventVenues.eventId, id))
      .orderBy(asc(canonEventVenues.position)),
    exec
      .select({ title: canonEventPhases.title, body: canonEventPhases.body })
      .from(canonEventPhases)
      .where(eq(canonEventPhases.eventId, id))
      .orderBy(asc(canonEventPhases.position)),
    peopleIds.length
      ? exec
          .select({
            id: profiles.id,
            firstName: profiles.firstName,
            lastName: profiles.lastName,
          })
          .from(profiles)
          .where(inArray(profiles.id, peopleIds))
      : Promise.resolve([]),
  ]);

  const person = (pid: string | null) =>
    pid ? (people.find((p) => p.id === pid) ?? null) : null;
  const kindOrder: DateKind[] = ["event", "marketing", "registration"];

  return {
    id: event.id,
    name: event.name,
    categoryId: event.categoryId,
    categoryName: event.categoryName,
    isPaid: event.isPaid,
    fee: event.fee,
    participation: event.participation,
    teamMin: event.teamMin,
    teamMax: event.teamMax,
    shortDesc: event.shortDesc,
    status: event.status,
    spocs,
    dates: [...dates].sort(
      (a, b) => kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind),
    ),
    venues,
    phases,
    createdAt: event.createdAt,
    createdBy: person(event.createdById),
    updatedAt: event.updatedAt,
    updatedBy: person(event.updatedById),
  };
};

export const getCanonEvent = (id: string) => loadEventDetail(db, id);

/** SPOC ids + status for an event — the authz input for writes. */
export const getCanonEventAuthInfo = async (
  id: string,
): Promise<{ status: EventStatus; spocIds: string[] } | null> => {
  const [event] = await db
    .select({ status: canonEvents.status })
    .from(canonEvents)
    .where(eq(canonEvents.id, id))
    .limit(1);
  if (!event) return null;
  const spocs = await db
    .select({ profileId: canonEventSpocs.profileId })
    .from(canonEventSpocs)
    .where(eq(canonEventSpocs.eventId, id));
  return { status: event.status, spocIds: spocs.map((s) => s.profileId) };
};

/** Approved members, one row each — options for the SPOC picker. */
export const listCanonMemberOptions = async (): Promise<CanonPerson[]> =>
  db
    .select({
      id: profiles.id,
      firstName: profiles.firstName,
      lastName: profiles.lastName,
      phone: profiles.phone,
    })
    .from(profiles)
    .where(eq(profiles.status, "approved"))
    .orderBy(asc(profiles.firstName), asc(profiles.lastName));

/** Of `ids`, which are approved members. */
export const approvedProfileIds = async (ids: string[]): Promise<string[]> => {
  if (!ids.length) return [];
  const rows = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(and(inArray(profiles.id, ids), eq(profiles.status, "approved")));
  return rows.map((r) => r.id);
};

// --- event writes ----------------------------------------------------------

/** Creates an empty draft in the first category; returns its id. */
export const createCanonEvent = async (actorId: string): Promise<string> => {
  const [category] = await db
    .select({ id: canonCategories.id })
    .from(canonCategories)
    .orderBy(asc(canonCategories.position))
    .limit(1);
  if (!category) throw new Error("No Canon categories exist. Run the seed.");

  const id = crypto.randomUUID();
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.insert(canonEvents).values({
      id,
      name: "Untitled event",
      categoryId: category.id,
      createdBy: actorId,
      createdAt: now,
      updatedBy: actorId,
      updatedAt: now,
    });
    await tx
      .insert(canonEventRevisions)
      .values({ eventId: id, actorId, at: now, changedFields: ["created"] });
  });
  return id;
};

/** Field-level snapshot used to diff a save into `changed_fields`. */
const snapshot = (e: {
  name: string;
  categoryId: string;
  isPaid: boolean;
  fee: number | null;
  participation: Participation;
  teamMin: number | null;
  teamMax: number | null;
  shortDesc: string;
  spocIds: string[];
  dates: CanonDate[];
  venues: CanonVenue[];
  phases: CanonPhase[];
}) => ({
  name: e.name,
  category: e.categoryId,
  type: [e.isPaid, e.fee],
  participation: [e.participation, e.teamMin, e.teamMax],
  shortDesc: e.shortDesc,
  spocs: e.spocIds,
  dates: [...e.dates].sort((a, b) => a.kind.localeCompare(b.kind)),
  venues: e.venues,
  phases: e.phases,
});

export type SaveResult = "ok" | "stale" | "missing" | "unchanged";

/**
 * Replaces an event's fields and child rows in one transaction.
 *
 * Optimistic lock: the UPDATE only lands if `updated_at` still equals the
 * version the editor loaded (`expectedUpdatedAt`, ms precision — JS Dates can't
 * carry Postgres microseconds, hence the `date_trunc`). Otherwise `"stale"`.
 */
export const saveCanonEvent = async (params: {
  id: string;
  data: EventSaveData;
  actorId: string;
  expectedUpdatedAt: string;
}): Promise<SaveResult> => {
  const { id, data, actorId } = params;

  return db.transaction(async (tx) => {
    const current = await loadEventDetail(tx, id);
    if (!current) return "missing";

    const before = snapshot({
      ...current,
      spocIds: current.spocs.map((s) => s.id),
    });
    const after = snapshot(data);
    const changed = (Object.keys(after) as (keyof typeof after)[]).filter(
      (k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]),
    );
    if (!changed.length) return "unchanged";

    const updated = await tx
      .update(canonEvents)
      .set({
        name: data.name,
        categoryId: data.categoryId,
        isPaid: data.isPaid,
        fee: data.fee,
        participation: data.participation,
        teamMin: data.teamMin,
        teamMax: data.teamMax,
        shortDesc: data.shortDesc,
        updatedAt: new Date(),
        updatedBy: actorId,
      })
      .where(
        and(
          eq(canonEvents.id, id),
          sql`date_trunc('milliseconds', ${canonEvents.updatedAt}) = ${params.expectedUpdatedAt}::timestamptz`,
        ),
      )
      .returning({ id: canonEvents.id });
    if (!updated.length) return "stale";

    await Promise.all([
      tx.delete(canonEventSpocs).where(eq(canonEventSpocs.eventId, id)),
      tx.delete(canonEventDates).where(eq(canonEventDates.eventId, id)),
      tx.delete(canonEventVenues).where(eq(canonEventVenues.eventId, id)),
      tx.delete(canonEventPhases).where(eq(canonEventPhases.eventId, id)),
    ]);

    if (data.spocIds.length) {
      await tx.insert(canonEventSpocs).values(
        data.spocIds.map((profileId, position) => ({
          eventId: id,
          profileId,
          position,
        })),
      );
    }
    if (data.dates.length) {
      await tx
        .insert(canonEventDates)
        .values(data.dates.map((d) => ({ ...d, eventId: id })));
    }
    if (data.venues.length) {
      await tx
        .insert(canonEventVenues)
        .values(
          data.venues.map((v, position) => ({ ...v, eventId: id, position })),
        );
    }
    if (data.phases.length) {
      await tx
        .insert(canonEventPhases)
        .values(
          data.phases.map((p, position) => ({ ...p, eventId: id, position })),
        );
    }

    await tx
      .insert(canonEventRevisions)
      .values({ eventId: id, actorId, changedFields: changed });
    return "ok";
  });
};

export const setCanonEventStatus = async (
  id: string,
  status: EventStatus,
  actorId: string,
) => {
  await db.transaction(async (tx) => {
    await tx
      .update(canonEvents)
      .set({ status, updatedAt: new Date(), updatedBy: actorId })
      .where(eq(canonEvents.id, id));
    await tx
      .insert(canonEventRevisions)
      .values({ eventId: id, actorId, changedFields: ["status"] });
  });
};

export const deleteCanonEvent = async (id: string) => {
  await db.delete(canonEvents).where(eq(canonEvents.id, id));
};

// --- categories ------------------------------------------------------------

export const listCanonCategories = async (): Promise<CanonCategoryRow[]> =>
  db
    .select({
      id: canonCategories.id,
      name: canonCategories.name,
      position: canonCategories.position,
    })
    .from(canonCategories)
    .orderBy(asc(canonCategories.position), asc(canonCategories.name));

export const categoryExists = async (id: string) => {
  const [row] = await db
    .select({ id: canonCategories.id })
    .from(canonCategories)
    .where(eq(canonCategories.id, id))
    .limit(1);
  return Boolean(row);
};

export const createCanonCategory = async (name: string) => {
  const [{ max } = { max: -1 }] = await db
    .select({
      max: sql<number>`coalesce(max(${canonCategories.position}), -1)`,
    })
    .from(canonCategories);
  await db.insert(canonCategories).values({ name, position: Number(max) + 1 });
};

export const renameCanonCategory = async (id: string, name: string) => {
  await db
    .update(canonCategories)
    .set({ name })
    .where(eq(canonCategories.id, id));
};

export const countEventsInCategory = async (id: string) => {
  const [row] = await db
    .select({ n: count() })
    .from(canonEvents)
    .where(eq(canonEvents.categoryId, id));
  return row?.n ?? 0;
};

export const deleteCanonCategory = async (id: string) => {
  await db.delete(canonCategories).where(eq(canonCategories.id, id));
};
