"use server";

import { revalidatePath } from "next/cache";
import { rolesEnum } from "@/database/schemas/roles";
import { requireWriteAccess } from "@/lib/auth/context";
import { canIn } from "@/lib/auth/permissions";
import { checkExclusiveReadOnlyRole } from "@/lib/auth/roles";
import { notifyRealtime } from "@/lib/realtime/notify";
import {
  getProfileDomains,
  type RoleLabel,
  setMemberDecision,
  setMemberRoles,
} from "@/utils/dbActions";

export type DecisionResult = { ok: true } | { error: string };

export type RoleAssignment = { role: string; domain: string };

const VALID_ROLES = new Set<string>(rolesEnum.enumValues);

export async function decideMember(
  profileId: string,
  decision: "approved" | "rejected",
  assignments?: RoleAssignment[],
): Promise<DecisionResult> {
  const ctx = await requireWriteAccess("member.approve");
  if ("error" in ctx) return ctx;

  // Scope does the narrowing that `domainLeadsCanApprove` + an explicit domain
  // intersection used to do by hand: an approver holds `member.approve` via a
  // global-scoped role, so `canIn` is true for every domain; a lead holds it via
  // a domain-scoped role, so it is true only in the domains they lead. Granting
  // or revoking `member.approve` on the `lead`/`co-lead` rows in the permission
  // grid IS the old toggle.
  const memberDomains = await getProfileDomains(profileId);
  const allowed = memberDomains.some((d) =>
    canIn(ctx.grants, "member.approve", d),
  );
  if (!allowed) return { error: "You are not allowed to do that." };

  // On approve, persist the (possibly trimmed) per-domain roles. Approvers can
  // drop domains the applicant mis-applied for, but at least one must remain.
  if (decision === "approved" && memberDomains.length > 0) {
    if (!assignments || assignments.length === 0)
      return { error: "Keep the member in at least one domain." };
    const allowedDomains = new Set(memberDomains);
    for (const a of assignments) {
      if (!VALID_ROLES.has(a.role)) return { error: "Invalid role." };
      if (!allowedDomains.has(a.domain))
        return { error: "Invalid domain for this member." };
    }

    // Grants are additive with no deny rules, so a read-only role must never sit
    // alongside a granting one — see `checkExclusiveReadOnlyRole`.
    const exclusivity = await checkExclusiveReadOnlyRole(
      assignments.map((a) => a.role),
    );
    if (exclusivity) return { error: exclusivity };

    try {
      await setMemberRoles(
        profileId,
        assignments.map((a) => ({
          role: a.role as RoleLabel,
          domain: a.domain,
        })),
      );
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : "Could not save the roles.",
      };
    }
  }

  try {
    // Rejecting drops an approved holder — if it were the club's last one,
    // `setMemberDecision` refuses rather than locking the org out.
    await setMemberDecision(ctx.userId, profileId, decision);
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Could not record the decision.",
    };
  }

  revalidatePath("/dashboard/member-requests");
  await notifyRealtime({ scope: "member" });
  return { ok: true };
}
