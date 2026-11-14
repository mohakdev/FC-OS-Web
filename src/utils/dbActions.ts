// Shared DB actions / query helpers. Writes that cross a trust boundary should
// go through validation + access control at the calling Server Action; these
// helpers own the actual SQL.

import { eq } from "drizzle-orm";
import { db } from "../database/db";
import {
  type ProfileLink,
  profileDetails,
} from "../database/schemas/profile_details";
import { type NewProfile, profiles } from "../database/schemas/profiles";
import type { rolesEnum } from "../database/schemas/roles";
import { userRoles } from "../database/schemas/user_roles";
import { SUPERADMIN_ROLE } from "../lib/auth/catalog";
import { lockoutMessage, missingAfter } from "../lib/auth/lockout";
import { canIn, type Grants } from "../lib/auth/permissions";
import {
  getRoleScopes,
  heldMustHavePermissions,
  holdsSuperadmin,
} from "../lib/auth/roles";
import type { OnboardingInput } from "../lib/validation/onboarding";

export type RoleLabel = (typeof rolesEnum.enumValues)[number];
type NewUserRole = typeof userRoles.$inferInsert;

export const pushProfiles = async (values: NewProfile[]) => {
  await db.insert(profiles).values(values);
  return db.select().from(profiles);
};

/**
 * Creates a pending member profile and their domain memberships.
 *
 * Multi-domain membership reuses `user_roles`: one `member` row per chosen
 * domain. We generate the id up front and write the profile + its role rows
 * atomically in a single transaction.
 */
export const onboardProfile = async (
  authUserId: string,
  email: string,
  data: OnboardingInput,
) => {
  const profileId = crypto.randomUUID();

  await db.transaction(async (tx) => {
    await tx.insert(profiles).values({
      id: profileId,
      authUserId,
      email,
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
      gender: data.gender,
      dateOfBirth: data.dateOfBirth.toISOString().slice(0, 10),
      status: "pending_approval",
    });
    await tx.insert(userRoles).values(
      data.domains.map((domain) => ({
        id: profileId,
        role: "member" as const,
        domain,
      })),
    );
  });

  return profileId;
};

/** Loads pending applications with their requested domains, for the HRM page. */
export const getPendingMembers = async () => {
  const rows = await db
    .select({
      id: profiles.id,
      firstName: profiles.firstName,
      lastName: profiles.lastName,
      email: profiles.email,
      phone: profiles.phone,
      domain: userRoles.domain,
    })
    .from(profiles)
    .leftJoin(userRoles, eq(userRoles.id, profiles.id))
    .where(eq(profiles.status, "pending_approval"));

  // Collapse the per-domain join rows into one entry per profile.
  const byProfile = new Map<
    string,
    {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
      phone: string;
      domains: string[];
    }
  >();

  for (const row of rows) {
    const existing = byProfile.get(row.id);
    if (existing) {
      if (row.domain) existing.domains.push(row.domain);
    } else {
      byProfile.set(row.id, {
        id: row.id,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        phone: row.phone,
        domains: row.domain ? [row.domain] : [],
      });
    }
  }

  return [...byProfile.values()];
};

/**
 * Pending applicants the viewer can actually decide on. A global approver's
 * `canIn` is true everywhere; a lead's only in the domains they lead — so the
 * list narrows itself with no special case. Shared by the Member Requests page
 * and the sidebar badge so the two never disagree.
 */
export const getPendingMembersFor = async (grants: Grants) =>
  (await getPendingMembers()).filter((m) =>
    m.domains.some((d) => canIn(grants, "member.approve", d)),
  );

export type PendingMember = Awaited<
  ReturnType<typeof getPendingMembers>
>[number];

/** Returns all approved members with their domains and roles, for the directory. */
/**
 * The avatar's `?v=` cache-buster, or null when the member has no picture
 * (render initials). See `src/components/profile-avatar.tsx`.
 */
const avatarVersion = (key: string | null, updatedAt: Date | null) =>
  key ? (updatedAt?.getTime() ?? 0) : null;

export const getApprovedMembers = async () => {
  const rows = await db
    .select({
      id: profiles.id,
      authUserId: profiles.authUserId,
      firstName: profiles.firstName,
      lastName: profiles.lastName,
      email: profiles.email,
      phone: profiles.phone,
      gender: profiles.gender,
      dateOfBirth: profiles.dateOfBirth,
      status: profiles.status,
      approvedBy: profiles.approvedBy,
      decidedAt: profiles.decidedAt,
      quote: profileDetails.quote,
      links: profileDetails.links,
      avatarKey: profileDetails.avatarKey,
      avatarUpdatedAt: profileDetails.avatarUpdatedAt,
      domain: userRoles.domain,
      role: userRoles.role,
    })
    .from(profiles)
    .leftJoin(userRoles, eq(userRoles.id, profiles.id))
    .leftJoin(profileDetails, eq(profileDetails.userId, profiles.id))
    .where(eq(profiles.status, "approved"))
    .orderBy(profiles.firstName);

  const byProfile = new Map<
    string,
    {
      id: string;
      authUserId: string | null;
      firstName: string;
      lastName: string;
      email: string;
      phone: string;
      gender: "male" | "female" | null;
      dateOfBirth: string | null;
      status: "pending_approval" | "approved" | "rejected";
      approvedBy: string | null;
      decidedAt: Date | null;
      quote: string | null;
      links: ProfileLink[];
      avatarVersion: number | null;
      domains: string[];
      rolePairs: { role: string; domain: string | null }[];
    }
  >();

  for (const row of rows) {
    const existing = byProfile.get(row.id);
    if (existing) {
      if (row.domain && !existing.domains.includes(row.domain))
        existing.domains.push(row.domain);
      const alreadyHasPair = existing.rolePairs.some(
        (p) => p.role === row.role && p.domain === row.domain,
      );
      if (row.role && !alreadyHasPair)
        existing.rolePairs.push({ role: row.role, domain: row.domain });
    } else {
      byProfile.set(row.id, {
        id: row.id,
        authUserId: row.authUserId,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        phone: row.phone,
        gender: row.gender,
        dateOfBirth: row.dateOfBirth,
        status: row.status,
        approvedBy: row.approvedBy,
        decidedAt: row.decidedAt,
        quote: row.quote,
        links: row.links ?? [],
        avatarVersion: avatarVersion(row.avatarKey, row.avatarUpdatedAt),
        domains: row.domain ? [row.domain] : [],
        rolePairs: row.role ? [{ role: row.role, domain: row.domain }] : [],
      });
    }
  }

  return [...byProfile.values()];
};

export type ApprovedMember = Awaited<
  ReturnType<typeof getApprovedMembers>
>[number];

/** Loads a profile's basic identity + role/domain pairs, for the profile page. */
export const getProfile = async (profileId: string) => {
  const rows = await db
    .select({
      id: profiles.id,
      firstName: profiles.firstName,
      lastName: profiles.lastName,
      email: profiles.email,
      phone: profiles.phone,
      gender: profiles.gender,
      dateOfBirth: profiles.dateOfBirth,
      quote: profileDetails.quote,
      links: profileDetails.links,
      avatarKey: profileDetails.avatarKey,
      avatarUpdatedAt: profileDetails.avatarUpdatedAt,
      role: userRoles.role,
      domain: userRoles.domain,
    })
    .from(profiles)
    .leftJoin(userRoles, eq(userRoles.id, profiles.id))
    .leftJoin(profileDetails, eq(profileDetails.userId, profiles.id))
    .where(eq(profiles.id, profileId));

  const first = rows[0];
  if (!first) return null;

  const roles = [...new Set(rows.map((r) => r.role).filter((r) => r !== null))];
  const domains = [
    ...new Set(rows.map((r) => r.domain).filter((d) => d !== null)),
  ];

  return {
    id: first.id,
    firstName: first.firstName,
    lastName: first.lastName,
    email: first.email,
    phone: first.phone,
    gender: first.gender,
    dateOfBirth: first.dateOfBirth,
    quote: first.quote,
    links: first.links ?? [],
    avatarVersion: avatarVersion(first.avatarKey, first.avatarUpdatedAt),
    roles,
    domains,
  };
};

/** Returns the domain ids a profile belongs to (from `user_roles`). */
export const getProfileDomains = async (
  profileId: string,
): Promise<string[]> => {
  const rows = await db
    .select({ domain: userRoles.domain })
    .from(userRoles)
    .where(eq(userRoles.id, profileId));

  return [
    ...new Set(
      rows
        .map((r) => r.domain)
        .filter((d): d is NonNullable<typeof d> => d !== null),
    ),
  ];
};

/**
 * Replaces a profile's role assignments. Domain-scoped roles keep their domain;
 * global roles collapse to a single `domain = null` row (deduped). The
 * delete + insert run atomically in a single transaction.
 *
 * Which roles are global is read from `roles.scope` rather than a local copy of
 * the list. `resolveGrants` keys off that same column, so a drifted copy here
 * would write rows the permission resolver then interprets differently.
 *
 * Being the single writer of `user_roles`, this is also where the org-lockout
 * invariant belongs for this path: demoting the club's only president would
 * otherwise leave `role.manage` granted to a role nobody holds — permanently,
 * since reaching the permission grid needs that same permission. THROWS on that;
 * callers turn it into a toast.
 */
export const setMemberRoles = async (
  profileId: string,
  assignments: { role: RoleLabel; domain: string }[],
) => {
  const scopes = await getRoleScopes();
  const seenGlobal = new Set<string>();
  const rows: NewUserRole[] = [];

  for (const { role, domain } of assignments) {
    // Superadmin is DB-only: never written from here (it is preserved below).
    if (role === SUPERADMIN_ROLE) continue;
    if (scopes.get(role) === "global") {
      if (seenGlobal.has(role)) continue;
      seenGlobal.add(role);
      rows.push({ id: profileId, role, domain: null });
    } else {
      rows.push({
        id: profileId,
        role,
        domain: domain as NewUserRole["domain"],
      });
    }
  }

  await db.transaction(async (tx) => {
    const before = await heldMustHavePermissions(tx);

    // This replaces ALL of the user's rows, so carry a superadmin row across —
    // otherwise editing the maintainer's domains in the directory would
    // silently strip it.
    if (await holdsSuperadmin(profileId, tx)) {
      rows.push({ id: profileId, role: SUPERADMIN_ROLE, domain: null });
    }

    await tx.delete(userRoles).where(eq(userRoles.id, profileId));
    if (rows.length > 0) await tx.insert(userRoles).values(rows);

    const lost = missingAfter(before, await heldMustHavePermissions(tx));
    if (lost.length > 0) throw new Error(lockoutMessage(lost));
  });
};

/**
 * Records an HRM/leadership approval decision + audit.
 *
 * Runs the org-lockout invariant too: the holder count only counts *approved*
 * profiles, so rejecting (or removing, which is a rejection) the last approved
 * president empties `role.manage` just as thoroughly as unticking the box would.
 * THROWS on that; callers turn it into a toast.
 */
export const setMemberDecision = async (
  approverId: string,
  profileId: string,
  status: "approved" | "rejected",
) => {
  await db.transaction(async (tx) => {
    // The maintainer can't be rejected or removed from the app (DB-only role).
    if (status === "rejected" && (await holdsSuperadmin(profileId, tx))) {
      throw new Error("The superadmin can't be removed from the app.");
    }

    const before = await heldMustHavePermissions(tx);

    await tx
      .update(profiles)
      .set({ status, approvedBy: approverId, decidedAt: new Date() })
      .where(eq(profiles.id, profileId));

    const lost = missingAfter(before, await heldMustHavePermissions(tx));
    if (lost.length > 0) throw new Error(lockoutMessage(lost));
  });
};

// ---------------------------------------------------------------------------
// Self-service profile (Customize dialog). Callers pass `ctx.userId` only —
// these never take a user id from the client.
// ---------------------------------------------------------------------------

/** Is `phone` already used by a profile other than `profileId`? */
export const isPhoneTaken = async (phone: string, profileId: string) => {
  const [row] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.phone, phone))
    .limit(1);
  return Boolean(row && row.id !== profileId);
};

/** Writes the editable `profiles` columns + upserts `profile_details` atomically. */
export const updateOwnProfileDetails = async (
  profileId: string,
  input: {
    phone: string;
    dateOfBirth: string;
    quote: string | null;
    links: ProfileLink[];
  },
) => {
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(profiles)
      .set({ phone: input.phone, dateOfBirth: input.dateOfBirth })
      .where(eq(profiles.id, profileId));
    await tx
      .insert(profileDetails)
      .values({
        userId: profileId,
        quote: input.quote,
        links: input.links,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: profileDetails.userId,
        set: { quote: input.quote, links: input.links, updatedAt: now },
      });
  });
};

/** Current avatar object key for a profile, or null. */
export const getAvatarKey = async (profileId: string) => {
  const [row] = await db
    .select({ key: profileDetails.avatarKey })
    .from(profileDetails)
    .where(eq(profileDetails.userId, profileId))
    .limit(1);
  return row?.key ?? null;
};

/** The member's avatar cache-buster (null = no picture), for the sidebar. */
export const getAvatarVersion = async (profileId: string) => {
  const [row] = await db
    .select({
      key: profileDetails.avatarKey,
      updatedAt: profileDetails.avatarUpdatedAt,
    })
    .from(profileDetails)
    .where(eq(profileDetails.userId, profileId))
    .limit(1);
  return row ? avatarVersion(row.key, row.updatedAt) : null;
};

/**
 * Points a profile at a new avatar object (or none, with `key = null`).
 * Returns the previous key so the caller can delete the old object.
 */
export const setAvatarKey = async (profileId: string, key: string | null) => {
  const now = new Date();
  return db.transaction(async (tx) => {
    const [prev] = await tx
      .select({ key: profileDetails.avatarKey })
      .from(profileDetails)
      .where(eq(profileDetails.userId, profileId))
      .for("update");
    await tx
      .insert(profileDetails)
      .values({
        userId: profileId,
        avatarKey: key,
        avatarUpdatedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: profileDetails.userId,
        set: { avatarKey: key, avatarUpdatedAt: now, updatedAt: now },
      });
    return prev?.key ?? null;
  });
};
