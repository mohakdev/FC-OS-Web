import { pgEnum, pgTable, serial } from "drizzle-orm/pg-core";

export const rolesEnum = pgEnum("role_label", [
  "member",
  "associate lead",
  "co-lead",
  "lead",
  "human resource manager",
  "leadership",
]);

export const roles = pgTable("roles", {
  id: serial("role_id").primaryKey(),
  label: rolesEnum().default("member"),
});

export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;
