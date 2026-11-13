import { date, pgEnum, pgTable, unique, uuid } from "drizzle-orm/pg-core";
import { canonEvents } from "./canon_events";

export const canonDateKindEnum = pgEnum("canon_date_kind", [
  "event",
  "marketing",
  "registration",
]);

export const canonDateStatusEnum = pgEnum("canon_date_status", [
  "tentative",
  "confirmed",
]);

// At most one row per (event, kind). `end_date` null = single day.
export const canonEventDates = pgTable(
  "canon_event_dates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .references(() => canonEvents.id, { onDelete: "cascade" })
      .notNull(),
    kind: canonDateKindEnum("kind").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    status: canonDateStatusEnum("status").notNull().default("tentative"),
  },
  (table) => [
    unique("canon_event_dates_event_kind_unique").on(table.eventId, table.kind),
  ],
);

export type CanonEventDate = typeof canonEventDates.$inferSelect;
export type NewCanonEventDate = typeof canonEventDates.$inferInsert;
