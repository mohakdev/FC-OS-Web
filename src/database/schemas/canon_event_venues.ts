import { integer, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { canonEvents } from "./canon_events";

// Ordered ladder: not_booked → unconfirmed → confirmed → booked.
export const canonVenueStatusEnum = pgEnum("canon_venue_status", [
  "not_booked",
  "unconfirmed",
  "confirmed",
  "booked",
]);

// 0..n venues per event; `days` scopes a venue to part of the event
// (e.g. "Day 1", "14–15 Feb") so per-day venues are representable.
export const canonEventVenues = pgTable("canon_event_venues", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: uuid("event_id")
    .references(() => canonEvents.id, { onDelete: "cascade" })
    .notNull(),
  position: integer("position").notNull().default(0),
  name: text("name").notNull(),
  days: text("days"),
  status: canonVenueStatusEnum("status").notNull().default("not_booked"),
});

export type CanonEventVenue = typeof canonEventVenues.$inferSelect;
export type NewCanonEventVenue = typeof canonEventVenues.$inferInsert;
