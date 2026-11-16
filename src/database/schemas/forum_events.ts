import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { domains, domainsEnum } from "./domains";
import { profiles } from "./profiles";

// Forum is for INTERNAL club meetings only — external events live in Canon.
// The kind (+ `domain`) decides who is expected; the audience is derived on
// read, never stored (see `getEventAudience` in utils/forumDbActions.ts):
//   domain_meeting → members of `domain` + leadership
//   club_meeting   → every approved, non-read-only member ("full-team meet")
export const forumEventKindEnum = pgEnum("forum_event_kind", [
  "domain_meeting",
  "club_meeting",
]);

export const forumEventStatusEnum = pgEnum("forum_event_status", [
  "scheduled",
  "cancelled",
]);

// One row per internal meeting. Invites hang off it today; attendance will
// reference it when the Attendance Tracker is built.
export const forumEvents = pgTable(
  "forum_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    kind: forumEventKindEnum("kind").notNull(),
    // Set iff kind = domain_meeting (CHECK below).
    domain: domainsEnum("domain").references(() => domains.id, {
      onDelete: "restrict",
    }),
    title: varchar("title", { length: 80 }).notNull(),
    description: text("description").notNull().default(""),
    venue: text("venue"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    status: forumEventStatusEnum("status").notNull().default("scheduled"),
    // Bumped on every change the audience should hear about (time, venue,
    // cancel). Doubles as the iCalendar SEQUENCE and keys update emails.
    revision: integer("revision").notNull().default(0),
    createdBy: uuid("created_by").references(() => profiles.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedBy: uuid("updated_by").references(() => profiles.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    check(
      "forum_events_domain_kind_check",
      sql`(${t.kind} = 'domain_meeting') = (${t.domain} IS NOT NULL)`,
    ),
    check(
      "forum_events_time_order_check",
      sql`${t.endsAt} IS NULL OR ${t.endsAt} > ${t.startsAt}`,
    ),
    index("forum_events_starts_at_idx").on(t.startsAt),
  ],
);

export type ForumEvent = typeof forumEvents.$inferSelect;
export type NewForumEvent = typeof forumEvents.$inferInsert;
