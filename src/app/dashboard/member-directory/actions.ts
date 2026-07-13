"use server";

import { revalidatePath } from "next/cache";
import { domainsEnum } from "@/database/schemas/domains";
import { rolesEnum } from "@/database/schemas/roles";
import { requireWriteAccess } from "@/lib/auth/context";
import {
  checkExclusiveReadOnlyRole,
  getRoleScopes,
  grantsForRoles,
} from "@/lib/auth/roles";
import { notifyRealtime } from "@/lib/realtime/notify";
import {
  type RoleLabel,
  setMemberDecision,
  setMemberRoles,
} from "@/utils/dbActions";

export type ManageResult = { ok: true } | { error: string };

export type RoleAssignment = { role: string; domain: string };

const VALID_ROLES = new Set<string>(rolesEnum.enumValues);
const VALID_DOMAINS = new Set<string>(domainsEnum.enumValues);

/**
 * Replaces an approved member's domain/role assignments from the directory.
 * Requires `member.manage`; domain leads are not granted it.
 */
export async function updateMember(
  profileId: string,
  assignments: RoleAssignment[],
): Promise<ManageResult> {
  const ctx = await requireWriteAccess("member.manage");
  if ("error" in ctx) return ctx;

  if (assignments.length === 0)
    return { error: "Give the member at least one role." };

  const scopes = await getRoleScopes();
  for (const a of assignments) {
    if (!VALID_ROLES.has(a.role)) return { error: "Invalid role." };
    if (scopes.get(a.role) !== "global" && !VALID_DOMAINS.has(a.domain))
      return { error: "Invalid domain." };
  }

  const exclusivity = await checkExclusiveReadOnlyRole(
    assignments.map((a) => a.role),
  );
  if (exclusivity) return { error: exclusivity };

  // Don't let a manager strip their own `member.manage` and lock themselves out.
  // Computed from the PROSPECTIVE grants the new assignments would produce, not
  // from role names — the grid is editable, so "which roles are approvers" is no
  // longer a fact the code can know.
  if (profileId === ctx.userId) {
    const next = await grantsForRoles(assignments.map((a) => a.role));
    if (!next.has("member.manage"))
      return { error: "You can't remove your own member-management role." };
  }

  await setMemberRoles(
    profileId,
    assignments.map((a) => ({ role: a.role as RoleLabel, domain: a.domain })),
  );

  revalidatePath("/dashboard/member-directory");
  await notifyRealtime({ scope: "member" });
  return { ok: true };
}

/** Soft-removes a member from the directory by setting status to `rejected`. */
export async function removeMember(profileId: string): Promise<ManageResult> {
  const ctx = await requireWriteAccess("member.remove");
  if ("error" in ctx) return ctx;
  if (profileId === ctx.userId) return { error: "You can't remove yourself." };

  await setMemberDecision(ctx.userId, profileId, "rejected");

  revalidatePath("/dashboard/member-directory");
  await notifyRealtime({ scope: "member" });
  return { ok: true };
}
