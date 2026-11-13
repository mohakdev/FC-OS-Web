import { integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { canonEvents } from "./canon_events";

// Event flow: ordered phases, each a title + markdown body.
export const canonEventPhases = pgTable("canon_event_phases", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: uuid("event_id")
    .references(() => canonEvents.id, { onDelete: "cascade" })
    .notNull(),
  position: integer("position").notNull().default(0),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
});

export type CanonEventPhase = typeof canonEventPhases.$inferSelect;
export type NewCanonEventPhase = typeof canonEventPhases.$inferInsert;
