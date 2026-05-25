import { integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { domains } from "./domains";
import { roles } from "./roles";

export const profiles = pgTable("profiles", {
  // Placeholder until auth.users is wired into the app.
  id: uuid("user_id").defaultRandom().primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").unique().notNull(),
  phone: integer("phone").unique().notNull(),
  roleId: integer("role_id")
    .references(() => roles.id, { onDelete: "set default" })
    .notNull(),
  domainId: integer("domain_id").references(() => domains.id, {
    onDelete: "cascade",
  }),
});

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
