import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { profiles } from "./profiles";

export const bugStatusEnum = pgEnum("bug_report_status", ["open", "fixed"]);

// Club-wide bug reports for FC OS itself. Any approved member can file one;
// resolving/deleting is gated on the `bug.manage` permission.
export const bugReports = pgTable("bug_reports", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  status: bugStatusEnum("status").notNull().default("open"),
  // Authorship survives the reporter leaving the club — the report stays, the
  // attribution goes to "Unknown".
  reportedBy: uuid("reported_by").references(() => profiles.id, {
    onDelete: "set null",
  }),
  resolvedBy: uuid("resolved_by").references(() => profiles.id, {
    onDelete: "set null",
  }),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type BugReport = typeof bugReports.$inferSelect;
export type NewBugReport = typeof bugReports.$inferInsert;
