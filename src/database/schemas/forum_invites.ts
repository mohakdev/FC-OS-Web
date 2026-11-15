import {
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { forumEvents } from "./forum_events";
import { profiles } from "./profiles";

export const forumInviteKindEnum = pgEnum("forum_invite_kind", [
  "invite",
  "update",
  "cancel",
]);

// Log of emails sent to an event's audience. One row per (event, member, kind,
// revision) — the primary key is what makes sending idempotent: a retry or a
// second click only mails people without a row. `invite` rows are written at
// revision 0 regardless of when they go out (a member who joins the domain later
// gets the invite, not an "update").
export const forumInvites = pgTable(
  "forum_invites",
  {
    eventId: uuid("event_id")
      .references(() => forumEvents.id, { onDelete: "cascade" })
      .notNull(),
    profileId: uuid("profile_id")
      .references(() => profiles.id, { onDelete: "cascade" })
      .notNull(),
    kind: forumInviteKindEnum("kind").notNull(),
    revision: integer("revision").notNull().default(0),
    sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.profileId, t.kind, t.revision] }),
  ],
);

export type ForumInvite = typeof forumInvites.$inferSelect;
