import { Refresher } from "@/components/realtime/refresher";
import { getAccessContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { listBugReports } from "@/utils/bugDbActions";
import BugReportsClient from "./bug-reports-client";

export const dynamic = "force-dynamic";

export default async function BugReportsPage() {
  const [bugs, ctx] = await Promise.all([listBugReports(), getAccessContext()]);
  // Bug reports span the whole club and the resolve/delete actions take no
  // domain, so the grant only counts when held globally.
  const canManage = ctx ? can(ctx.grants, "bug.manage") : false;
  const openCount = bugs.filter((b) => b.status === "open").length;

  return (
    <div className="flex flex-col gap-4">
      <Refresher scope="bug-report" />
      <div>
        <h1 className="font-serif text-3xl text-primary">Bug Reports</h1>
        <p className="text-sm text-muted-foreground">
          Something broken in FC OS? Report it here.{" "}
          <span className="font-medium text-foreground">{openCount} open</span>
        </p>
      </div>
      <BugReportsClient
        bugs={bugs}
        canManage={canManage}
        currentUserId={ctx?.userId ?? null}
      />
    </div>
  );
}
