import { pgEnum, pgTable } from "drizzle-orm/pg-core";

export const rolesEnum = pgEnum("role_label", [
  "member",
  "associate lead",
  "co-lead",
  "lead",
  "human resource manager",
  "vice president",
  "president",
  // Read-only roles: full view access across FC OS, no mutations.
  "advisor",
  "alumni",
  // Platform maintainer: holds every permission (locked in the grid) and can
  // "view as" any role. Assigned in the DB only — never from the app.
  "superadmin",
]);
export const scopeEnum = pgEnum("scope", ["domain", "global"]);

export const roles = pgTable("roles", {
  id: rolesEnum("role_id").default("member").primaryKey(),
  scope: scopeEnum().default("domain").notNull(),
});

export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;
