import { pgEnum, pgTable, serial } from "drizzle-orm/pg-core";

export const domainsEnum = pgEnum("domain", [
  "technical",
  "creatives",
  "operations",
  "outreach",
]);

export const domains = pgTable("domains", {
  id: serial("domain_id").primaryKey(),
  label: domainsEnum(),
});

export type Domain = typeof domains.$inferSelect;
export type NewDomain = typeof domains.$inferInsert;
