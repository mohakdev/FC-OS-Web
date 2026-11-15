"use server";

import { revalidatePath } from "next/cache";
import { domainsEnum } from "@/database/schemas/domains";
import { SUPERADMIN_ROLE } from "@/lib/auth/catalog";
import { requireGlobalWriteAccess } from "@/lib/auth/context";
import {
  ASSIGNABLE_ROLES,
  checkExclusiveReadOnlyRole,
  getRoleScopes,
  globalGrantsForRoles,
  holdsSuperadmin,
} from "@/lib/auth/roles";
import { isUniqueViolation } from "@/lib/db/errors";
import { notifyRealtime } from "@/lib/realtime/notify";
import { raNumberSchema } from "@/lib/validation/onboarding";
import {
  isRaNumberTaken,
  type RoleLabel,
  setMemberDecision,
  setMemberRaNumber,
  setMemberRoles,
} from "@/utils/dbActions";

export type ManageResult = { ok: true } | { error: string };

export type RoleAssignment = { role: string; domain: string };

// Superadmin is DB-only, so it is not in this set.
const VALID_ROLES = ASSIGNABLE_ROLES;
const VALID_DOMAINS = new Set<string>(domainsEnum.enumValues);

/**
 * Replaces an approved member's domain/role assignments from the directory.
 *
 * Requires `member.manage` held GLOBALLY: the directory spans the whole club and
 * this action takes no domain to narrow to, so a domain-scoped grant would act
 * org-wide. See `requireGlobalWriteAccess`.
 */
export async function updateMember(
  profileId: string,
  assignments: RoleAssignment[],
): Promise<ManageResult> {
  const ctx = await requireGlobalWriteAccess("member.manage");
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
  // longer a fact the code can know. Global-scoped grants only: this page is
  // gated on `can()`, so keeping `member.manage` through a domain role would
  // still lock them out of it.
  if (profileId === ctx.userId) {
    const nextRoles = assignments.map((a) => a.role);
    // `setMemberRoles` carries a superadmin row across, so count it here too.
    if (await holdsSuperadmin(profileId)) nextRoles.push(SUPERADMIN_ROLE);
    const next = await globalGrantsForRoles(nextRoles);
    if (!next.has("member.manage"))
      return { error: "You can't remove your own member-management role." };
  }

  try {
    await setMemberRoles(
      profileId,
      assignments.map((a) => ({ role: a.role as RoleLabel, domain: a.domain })),
    );
  } catch (err) {
    // The org-lockout invariant lives in the data layer, on the single writer of
    // `user_roles`. Surface it as a toast rather than a 500.
    return {
      error:
        err instanceof Error ? err.message : "Could not update the member.",
    };
  }

  revalidatePath("/dashboard/member-directory");
  await notifyRealtime({ scope: "member" });
  return { ok: true };
}

/**
 * Soft-removes a member from the directory by setting status to `rejected`.
 * Org-wide, so `member.remove` must be held globally — same reasoning as
 * `updateMember`.
 */
export async function removeMember(profileId: string): Promise<ManageResult> {
  const ctx = await requireGlobalWriteAccess("member.remove");
  if ("error" in ctx) return ctx;
  if (profileId === ctx.userId) return { error: "You can't remove yourself." };

  try {
    // Removing the club's last approved president would strip `role.manage`
    // from everyone — `setMemberDecision` refuses that.
    await setMemberDecision(ctx.userId, profileId, "rejected");
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Could not remove the member.",
    };
  }

  revalidatePath("/dashboard/member-directory");
  await notifyRealtime({ scope: "member" });
  return { ok: true };
}

const RA_TAKEN = "That RA number is already registered to another member.";

/**
 * Replaces a member's RA number (members can't change their own). Replace
 * only — the schema requires a valid RA, so it can never be cleared. Org-wide,
 * so `member.ra.edit` must be held globally.
 */
export async function updateMemberRa(
  profileId: string,
  raNumber: string,
): Promise<{ ok: true; raNumber: string } | { error: string }> {
  const ctx = await requireGlobalWriteAccess("member.ra.edit");
  if ("error" in ctx) return ctx;

  const parsed = raNumberSchema.safeParse(raNumber);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid RA number." };
  }
  if (await isRaNumberTaken(parsed.data, profileId)) return { error: RA_TAKEN };

  try {
    await setMemberRaNumber(profileId, parsed.data);
  } catch (e) {
    if (isUniqueViolation(e)) return { error: RA_TAKEN };
    throw e;
  }

  revalidatePath("/dashboard/member-directory");
  await notifyRealtime({ scope: "member" });
  return { ok: true, raNumber: parsed.data };
}
