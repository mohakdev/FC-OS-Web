import { integer, pgTable, text, uuid } from "drizzle-orm/pg-core";

// Canon event categories (Ideathon, Hackathon, …). An editable list rather than
// an enum so leadership can add one without a schema change.
export const canonCategories = pgTable("canon_categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  position: integer("position").notNull().default(0),
});

export type CanonCategory = typeof canonCategories.$inferSelect;
export type NewCanonCategory = typeof canonCategories.$inferInsert;
