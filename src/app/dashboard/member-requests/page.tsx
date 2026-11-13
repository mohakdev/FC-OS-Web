import { redirect } from "next/navigation";

import { Refresher } from "@/components/realtime/refresher";
import { getAccessContext } from "@/lib/auth/context";
import { canAny } from "@/lib/auth/permissions";
import { getPendingMembersFor } from "@/utils/dbActions";
import MemberRequestRow from "./member-request-row";

export const dynamic = "force-dynamic";

export default async function MemberRequestsPage() {
  const ctx = await getAccessContext();
  if (!ctx) redirect("/dashboard");

  // The dashboard layout already gated auth/approval; this guards the
  // capability. `canAny` = holds `member.approve` globally or in some domain.
  if (!canAny(ctx.grants, "member.approve")) redirect("/dashboard");

  // Only applicants the viewer could actually decide on.
  const members = await getPendingMembersFor(ctx.grants);

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
