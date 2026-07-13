import { Refresher } from "@/components/realtime/refresher";
import { getAccessContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { getApprovedMembers } from "@/utils/dbActions";
import MemberDirectoryClient from "./member-directory-client";

export const dynamic = "force-dynamic";

export default async function MemberDirectoryPage() {
  const [members, ctx] = await Promise.all([
    getApprovedMembers(),
    getAccessContext(),
  ]);
  // Directory management is org-wide, so it needs the grant globally — a lead
  // holding `member.manage` in one domain must not get the whole directory.
  const canManage = ctx ? can(ctx.grants, "member.manage") : false;

  return (
    <div className="flex flex-col gap-4">
      <Refresher scope="member" />
      <div>
        <h1 className="font-serif text-3xl text-primary">Member Directory</h1>
        <p className="text-sm text-muted-foreground">
          Browse and contact club members.{" "}
          <span className="font-medium text-foreground">
            {members.length} members
          </span>
        </p>
      </div>
      <MemberDirectoryClient members={members} canManage={canManage} />
    </div>
  );
}
