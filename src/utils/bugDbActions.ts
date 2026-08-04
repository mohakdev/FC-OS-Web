// Bug Reports DB helpers. Like `dbActions.ts`: these own the SQL only —
// validation + access control live in the calling Server Action
// (`src/app/dashboard/bug-reports/actions.ts`).

import { asc, desc, eq } from "drizzle-orm";
import { db } from "../database/db";
import { bugReports } from "../database/schemas/bug_reports";
import { profiles } from "../database/schemas/profiles";

export type BugStatus = "open" | "fixed";

/**
 * Every bug report with its reporter's name. Open reports first, newest first
 * within each group — `status` is an enum whose first value is `open`, so
 * ascending on it puts open above fixed.
 */
export const listBugReports = async () =>
  db
    .select({
      id: bugReports.id,
      title: bugReports.title,
      description: bugReports.description,
      status: bugReports.status,
      createdAt: bugReports.createdAt,
      reporterId: bugReports.reportedBy,
      reporterFirstName: profiles.firstName,
      reporterLastName: profiles.lastName,
    })
    .from(bugReports)
    .leftJoin(profiles, eq(profiles.id, bugReports.reportedBy))
    .orderBy(asc(bugReports.status), desc(bugReports.createdAt));

export type BugReportRow = Awaited<ReturnType<typeof listBugReports>>[number];

export const createBugReport = async (values: {
  title: string;
  description: string | null;
  reportedBy: string;
}) => {
  const [row] = await db
    .insert(bugReports)
    .values(values)
    .returning({ id: bugReports.id });
  return row.id;
};

/** Marks a report fixed (recording who resolved it) or reopens it. */
export const setBugReportStatus = async (
  id: string,
  status: BugStatus,
  actorId: string,
) => {
  await db
    .update(bugReports)
    .set({
      status,
      resolvedBy: status === "fixed" ? actorId : null,
      resolvedAt: status === "fixed" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(bugReports.id, id));
};

export const deleteBugReport = async (id: string) => {
  await db.delete(bugReports).where(eq(bugReports.id, id));
};
