import { integer, pgTable, primaryKey, uuid } from "drizzle-orm/pg-core";
import { canonEvents } from "./canon_events";
import { profiles } from "./profiles";

// Event single points of contact. Being a SPOC is a relationship, not a
// permission — editing still needs `canon.event.edit.own` (see lib/canon).
export const canonEventSpocs = pgTable(
  "canon_event_spocs",
  {
    eventId: uuid("event_id")
      .references(() => canonEvents.id, { onDelete: "cascade" })
      .notNull(),
    profileId: uuid("profile_id")
      .references(() => profiles.id, { onDelete: "cascade" })
      .notNull(),
    position: integer("position").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.eventId, table.profileId] })],
);

export type CanonEventSpoc = typeof canonEventSpocs.$inferSelect;
export type NewCanonEventSpoc = typeof canonEventSpocs.$inferInsert;
