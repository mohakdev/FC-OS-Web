import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { canonCategories } from "./canon_categories";
import { profiles } from "./profiles";

export const canonParticipationEnum = pgEnum("canon_participation", [
  "individual",
  "team",
  "both",
]);

export const canonEventStatusEnum = pgEnum("canon_event_status", [
  "draft",
  "published",
]);

// One Canon page per event — the club's single source of truth for it.
// Child rows (dates, venues, SPOCs, phases) live in their own tables.
export const canonEvents = pgTable(
  "canon_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 80 }).notNull(),
    categoryId: uuid("category_id")
      .references(() => canonCategories.id, { onDelete: "restrict" })
      .notNull(),
    // Participant registration fee. `fee` (whole ₹) is optional even when paid.
    isPaid: boolean("is_paid").notNull().default(false),
    fee: integer("fee"),
    // Who can enter. Team sizes apply to `team`, and to the team entries of
    // `both` (solo entries are allowed there too); `individual` has none.
    participation: canonParticipationEnum("participation")
      .notNull()
      .default("individual"),
    teamMin: integer("team_min"),
    teamMax: integer("team_max"),
    shortDesc: text("short_desc").notNull().default(""),
    status: canonEventStatusEnum("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdBy: uuid("created_by").references(() => profiles.id, {
      onDelete: "set null",
    }),
    // Doubles as the optimistic-lock version for saves.
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedBy: uuid("updated_by").references(() => profiles.id, {
      onDelete: "set null",
    }),
  },
  // Same rule as `eventSaveSchema` in lib/canon/schema.ts, enforced in the DB
  // too. Bounds mirror TEAM_MIN / TEAM_MAX in lib/canon/constants.ts.
  (t) => [
    check(
      "canon_events_team_size_check",
      sql`(${t.participation} = 'individual' AND ${t.teamMin} IS NULL AND ${t.teamMax} IS NULL)
        OR (${t.participation} <> 'individual' AND ${t.teamMin} IS NOT NULL AND ${t.teamMax} IS NOT NULL
            AND ${t.teamMin} >= 2 AND ${t.teamMin} <= ${t.teamMax} AND ${t.teamMax} <= 10)`,
    ),
  ],
);

export type CanonEvent = typeof canonEvents.$inferSelect;
export type NewCanonEvent = typeof canonEvents.$inferInsert;
