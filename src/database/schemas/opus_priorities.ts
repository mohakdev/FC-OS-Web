import {
  boolean,
  integer,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { domains, domainsEnum } from "./domains";

export const opusPriorities = pgTable(
  "opus_priorities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    domain: domainsEnum("domain")
      .references(() => domains.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    // When true, this priority is a "fixed" level (e.g. Urgent): rendered as a static,
    // fully-lit red bar icon instead of filling by its rank among the dynamic priorities.
    // Fixed priorities are kept ordered below all dynamic ones — see priorityBars in
    // @/lib/opus/format (mirrors opus_statuses.ring_full).
    ringFull: boolean("ring_full").notNull().default(false),
  },
  (table) => [
    unique("opus_priorities_domain_name_unique").on(table.domain, table.name),
  ],
);

export type OpusPriority = typeof opusPriorities.$inferSelect;
export type NewOpusPriority = typeof opusPriorities.$inferInsert;
