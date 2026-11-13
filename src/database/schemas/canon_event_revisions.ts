import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { canonEvents } from "./canon_events";
import { profiles } from "./profiles";

// One row per save: who changed which fields, when. Stored now so a History
// view can be added later without a migration.
export const canonEventRevisions = pgTable("canon_event_revisions", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: uuid("event_id")
    .references(() => canonEvents.id, { onDelete: "cascade" })
    .notNull(),
  actorId: uuid("actor_id").references(() => profiles.id, {
    onDelete: "set null",
  }),
  at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
  changedFields: text("changed_fields").array().notNull(),
});

export type CanonEventRevision = typeof canonEventRevisions.$inferSelect;
export type NewCanonEventRevision = typeof canonEventRevisions.$inferInsert;
