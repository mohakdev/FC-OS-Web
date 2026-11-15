// Forum DB actions / query helpers. Same trust-boundary convention as
// `dbActions.ts` / `canonDbActions.ts`: validation + access control live in the
// calling Server Action; these helpers own the SQL and do no authz.

import { and, asc, eq, exists, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../database/db";
import { forumEvents } from "../database/schemas/forum_events";
import { forumInvites } from "../database/schemas/forum_invites";
import { profileDetails } from "../database/schemas/profile_details";
import { profiles } from "../database/schemas/profiles";
import { rolePermissions } from "../database/schemas/role_permissions";
import { roles } from "../database/schemas/roles";
import { userRoles } from "../database/schemas/user_roles";
import { SUPERADMIN_ROLE } from "../lib/auth/catalog";
import { getRoleScopes, grantsForRoles } from "../lib/auth/roles";
import type { EventKind, EventStatus } from "../lib/forum/constants";
import type { MeetingValues } from "../lib/forum/schema";
import { DOMAIN_IDS, type DomainId, isDomainId } from "../lib/opus/format";

// --- types -----------------------------------------------------------------

export type EventPerson = { id: string; firstName: string; lastName: string };

export type EventRow = {
  id: string;
  kind: EventKind;
  domain: DomainId | null;
  title: string;
  description: string;
  venue: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  status: EventStatus;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: EventPerson | null;
  updatedBy: EventPerson | null;
};

export type AudienceMember = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarVersion: number | null;
};

export type InviteKind = "invite" | "update" | "cancel";

// --- reads -----------------------------------------------------------------

const creator = alias(profiles, "creator");
const editor = alias(profiles, "editor");

const eventSelect = {
  id: forumEvents.id,
  kind: forumEvents.kind,
  domain: forumEvents.domain,
  title: forumEvents.title,
  description: forumEvents.description,
  venue: forumEvents.venue,
  startsAt: forumEvents.startsAt,
  endsAt: forumEvents.endsAt,
  status: forumEvents.status,
  revision: forumEvents.revision,
  createdAt: forumEvents.createdAt,
  updatedAt: forumEvents.updatedAt,
  creatorId: creator.id,
  creatorFirst: creator.firstName,
  creatorLast: creator.lastName,
  editorId: editor.id,
  editorFirst: editor.firstName,
  editorLast: editor.lastName,
};

const baseQuery = () =>
  db
    .select(eventSelect)
    .from(forumEvents)
    .leftJoin(creator, eq(creator.id, forumEvents.createdBy))
    .leftJoin(editor, eq(editor.id, forumEvents.updatedBy));

type RawRow = Awaited<ReturnType<typeof baseQuery>>[number];

const person = (
  id: string | null,
  first: string | null,
  last: string | null,
): EventPerson | null =>
  id ? { id, firstName: first ?? "", lastName: last ?? "" } : null;

const toRow = (r: RawRow): EventRow => ({
  id: r.id,
  kind: r.kind,
  domain: r.domain,
  title: r.title,
  description: r.description,
  venue: r.venue,
  startsAt: r.startsAt,
  endsAt: r.endsAt,
  status: r.status,
  revision: r.revision,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
  createdBy: person(r.creatorId, r.creatorFirst, r.creatorLast),
  updatedBy: person(r.editorId, r.editorFirst, r.editorLast),
});

/** Every event, soonest first. Visibility filtering happens in the page. */
export const listEvents = async (): Promise<EventRow[]> => {
  const rows = await baseQuery().orderBy(asc(forumEvents.startsAt));
  return rows.map(toRow);
};

export const getEvent = async (id: string): Promise<EventRow | null> => {
  const [row] = await baseQuery().where(eq(forumEvents.id, id)).limit(1);
  return row ? toRow(row) : null;
};

/**
 * The members an event expects, derived from its kind — never stored, so a
 * member who joins or leaves a domain is right for every future event.
 *
 *   domain_meeting → approved members with a `user_roles` row in that domain,
 *                    PLUS leadership (anyone holding a global-scoped role), who
 *                    are invited to every domain's meetings
 *   club_meeting   → every approved member
 *   external       → nobody yet (volunteers arrive with Forum P2)
 *
 * A row only qualifies through a role that grants at least one permission, so
 * read-only roles (advisor / alumni — global, but grant nothing) are never
 * expected. "Read-only" and "leadership" are both derived from the grid and
 * `roles.scope`, never from role names. `superadmin` never qualifies anyone: it
 * is the platform maintainer's role, not a club position — a superadmin who is
 * also a lead/president is expected through that role.
 */
export const getEventAudience = async (event: {
  kind: EventKind;
  domain: DomainId | null;
}): Promise<AudienceMember[]> => {
  if (event.kind === "external") return [];
  if (event.kind === "domain_meeting" && !event.domain) return [];

  const grantingRole = and(
    ne(userRoles.role, SUPERADMIN_ROLE),
    exists(
      db
        .select({ one: sql`1` })
        .from(rolePermissions)
        .where(eq(rolePermissions.roleId, userRoles.role)),
    ),
  );
  const roleFilter =
    event.kind === "domain_meeting" && event.domain
      ? and(
          grantingRole,
          or(eq(userRoles.domain, event.domain), eq(roles.scope, "global")),
        )
      : grantingRole;

  const rows = await db
    .selectDistinct({
      id: profiles.id,
      firstName: profiles.firstName,
      lastName: profiles.lastName,
      email: profiles.email,
      avatarKey: profileDetails.avatarKey,
      avatarUpdatedAt: profileDetails.avatarUpdatedAt,
    })
    .from(profiles)
    .innerJoin(userRoles, eq(userRoles.id, profiles.id))
    .innerJoin(roles, eq(roles.id, userRoles.role))
    .leftJoin(profileDetails, eq(profileDetails.userId, profiles.id))
    .where(and(eq(profiles.status, "approved"), roleFilter))
    .orderBy(asc(profiles.firstName), asc(profiles.lastName));

  return rows.map((r) => ({
    id: r.id,
    firstName: r.firstName,
    lastName: r.lastName,
    email: r.email,
    avatarVersion: r.avatarKey ? (r.avatarUpdatedAt?.getTime() ?? 0) : null,
  }));
};

/**
 * The domains whose meetings this viewer is expected at — the same rule as
 * `getEventAudience`, for the list's "My meetings" filter. Leadership (a
 * granting, non-superadmin global role) is expected at every domain's meetings;
 * everyone else at their own domains'. Takes `roleIds` / `domainIds` from the
 * AccessContext so a "view as" switch is honoured.
 */
export const expectedDomains = async (viewer: {
  roleIds: string[];
  domainIds: string[];
}): Promise<DomainId[]> => {
  const scopes = await getRoleScopes();
  const globalRoles = viewer.roleIds.filter(
    (r) => r !== SUPERADMIN_ROLE && scopes.get(r) === "global",
  );
  if (globalRoles.length > 0 && (await grantsForRoles(globalRoles)).size > 0) {
    return [...DOMAIN_IDS];
  }
  return viewer.domainIds.filter(isDomainId);
};

/** Which audience members already got which email, for the detail page. */
export const getInviteLog = async (eventId: string) =>
  db
    .select({
      profileId: forumInvites.profileId,
      kind: forumInvites.kind,
      revision: forumInvites.revision,
      sentAt: forumInvites.sentAt,
    })
    .from(forumInvites)
    .where(eq(forumInvites.eventId, eventId));

/** Profile ids that already have a row for this (kind, revision). */
export const sentProfileIds = async (
  eventId: string,
  kind: InviteKind,
  revision: number,
): Promise<Set<string>> => {
  const rows = await db
    .select({ profileId: forumInvites.profileId })
    .from(forumInvites)
    .where(
      and(
        eq(forumInvites.eventId, eventId),
        eq(forumInvites.kind, kind),
        eq(forumInvites.revision, revision),
      ),
    );
  return new Set(rows.map((r) => r.profileId));
};

// --- writes ----------------------------------------------------------------

type EventFields = Omit<MeetingValues, "notify">;

export const createEvent = async (
  values: EventFields,
  actorId: string,
): Promise<string> => {
  const [row] = await db
    .insert(forumEvents)
    .values({
      kind: values.kind,
      domain: values.domain,
      title: values.title,
      description: values.description,
      venue: values.venue,
      startsAt: values.startsAt,
      endsAt: values.endsAt,
      createdBy: actorId,
      updatedBy: actorId,
    })
    .returning({ id: forumEvents.id });
  return row.id;
};

/**
 * Updates an event's editable fields. `kind` / `domain` are never changed here
 * (that would swap the audience under people who were already invited). The
 * revision is bumped only when something the audience cares about changed —
 * time or venue — and the new revision is returned so the caller can mail an
 * update keyed on it. Returns null when the event is gone.
 */
export const updateEvent = async (
  id: string,
  values: Pick<
    EventFields,
    "title" | "description" | "venue" | "startsAt" | "endsAt"
  >,
  actorId: string,
): Promise<{ revision: number; material: boolean } | null> =>
  db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        startsAt: forumEvents.startsAt,
        endsAt: forumEvents.endsAt,
        venue: forumEvents.venue,
        title: forumEvents.title,
        revision: forumEvents.revision,
      })
      .from(forumEvents)
      .where(eq(forumEvents.id, id))
      .for("update");
    if (!current) return null;

    const sameTime = (a: Date | null, b: Date | null) =>
      (a?.getTime() ?? null) === (b?.getTime() ?? null);
    const material =
      !sameTime(current.startsAt, values.startsAt) ||
      !sameTime(current.endsAt, values.endsAt) ||
      current.venue !== values.venue ||
      current.title !== values.title;
    const revision = material ? current.revision + 1 : current.revision;

    await tx
      .update(forumEvents)
      .set({
        title: values.title,
        description: values.description,
        venue: values.venue,
        startsAt: values.startsAt,
        endsAt: values.endsAt,
        revision,
        updatedBy: actorId,
        updatedAt: new Date(),
      })
      .where(eq(forumEvents.id, id));
    return { revision, material };
  });

/** Cancels an event (kept for history; attendance will reference it later). */
export const cancelEvent = async (
  id: string,
  actorId: string,
): Promise<number | null> => {
  const [row] = await db
    .update(forumEvents)
    .set({
      status: "cancelled",
      revision: sql`${forumEvents.revision} + 1`,
      updatedBy: actorId,
      updatedAt: new Date(),
    })
    .where(and(eq(forumEvents.id, id), eq(forumEvents.status, "scheduled")))
    .returning({ revision: forumEvents.revision });
  return row?.revision ?? null;
};

export const deleteEvent = async (id: string) => {
  await db.delete(forumEvents).where(eq(forumEvents.id, id));
};

type InviteKey = {
  eventId: string;
  profileId: string;
  kind: InviteKind;
  revision: number;
};

/**
 * Claims the right to send one email: inserts its log row and reports whether
 * THIS caller won it. The composite PK makes the insert atomic, so of two
 * overlapping send runs (a double-click, or "Send invites" during the initial
 * run) exactly one gets `true` per member — nobody is mailed twice.
 */
export const claimInvite = async (key: InviteKey): Promise<boolean> => {
  const rows = await db
    .insert(forumInvites)
    .values(key)
    .onConflictDoNothing()
    .returning({ profileId: forumInvites.profileId });
  return rows.length > 0;
};

/** Gives a claim back after SMTP rejected the mail, so a retry can send it. */
export const releaseInvite = async (key: InviteKey) => {
  await db
    .delete(forumInvites)
    .where(
      and(
        eq(forumInvites.eventId, key.eventId),
        eq(forumInvites.profileId, key.profileId),
        eq(forumInvites.kind, key.kind),
        eq(forumInvites.revision, key.revision),
      ),
    );
};
