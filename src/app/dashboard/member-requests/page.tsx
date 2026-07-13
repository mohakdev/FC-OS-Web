import { redirect } from "next/navigation";

import { Refresher } from "@/components/realtime/refresher";
import { getAccessContext } from "@/lib/auth/context";
import { canAny, canIn } from "@/lib/auth/permissions";
import { getPendingMembers } from "@/utils/dbActions";
import MemberRequestRow from "./member-request-row";

export const dynamic = "force-dynamic";

export default async function MemberRequestsPage() {
  const ctx = await getAccessContext();
  if (!ctx) redirect("/dashboard");

  // The dashboard layout already gated auth/approval; this guards the
  // capability. `canAny` = holds `member.approve` globally or in some domain.
  if (!canAny(ctx.grants, "member.approve")) redirect("/dashboard");

  const allPending = await getPendingMembers();
  // Show only applicants the viewer could actually decide on. For a global
  // approver `canIn` is true everywhere; for a lead it is true only in the
  // domains they lead — so the list narrows itself with no special case.
  const members = allPending.filter((m) =>
    m.domains.some((d) => canIn(ctx.grants, "member.approve", d)),
  );

  return (
    <div className="flex flex-col gap-4">
      <Refresher scope="member" />
      <div>
        <h1 className="font-serif text-3xl text-primary">Member Requests</h1>
        <p className="text-sm text-muted-foreground">
          Review and decide on pending membership applications.
        </p>
      </div>

      {members.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No pending requests right now.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {members.map((member) => (
            <MemberRequestRow key={member.id} member={member} />
          ))}
        </div>
      )}
    </div>
  );
}
