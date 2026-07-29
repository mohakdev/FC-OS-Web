import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { cache } from "react";

import { db } from "@/database/db";
import { profiles } from "@/database/schemas/profiles";
import { rolePermissions } from "@/database/schemas/role_permissions";
import { roles } from "@/database/schemas/roles";
import { userRoles } from "@/database/schemas/user_roles";
import type { PermissionId } from "./catalog";
import {
  can,
  canAny,
  EMPTY_GRANTS,
  type GrantRow,
  type Grants,
  resolveGrants,
} from "./permissions";
import { auth } from "./server";

export type ProfileStatus = "pending_approval" | "approved" | "rejected";

export type AccessContext = {
  /** App-side profile id (`profiles.id`) — the stable user id used across the app. */
  userId: string;
  /** Better Auth user id (`user.id`). */
  authUserId: string;
  firstName: string;
  lastName: string;
  status: ProfileStatus;
  roleIds: string[];
  /** Domains the user belongs to (empty for global-only roles). */
  domainIds: string[];
  /**
   * Resolved capabilities. The authorization model — see `./permissions.ts`.
   * Check these with `can` / `canIn` / `canAny`; never branch on `roleIds`.
   */
  grants: Grants;
};

export type AuthState =
  | { kind: "unauthenticated" }
  | { kind: "no-profile"; authUserId: string }
  | { kind: "active"; ctx: AccessContext };

/**
 * Resolves the current request's auth + onboarding/approval state from the
 * Better Auth session, the user's `profiles` row, and the capabilities their
 * roles grant. Callers must run dynamically (`export const dynamic = "force-dynamic"`).
 *
 * Wrapped in React `cache()` — the layout, the page, and (on a Server Action
 * POST) the action all call this within one request, and it would otherwise
 * re-run the session + profile + grants queries each time. `cache()` is
 * per-request and in-memory, so a permission change still takes effect on the
 * very next request.
 *
 * NEVER move this to `unstable_cache` / `"use cache"` / the Data Cache. Those
 * persist across requests, and a revoked approver would keep their access until
 * the cache expired.
 */
export const getAuthState = cache(async (): Promise<AuthState> => {
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user;
  if (!user) return { kind: "unauthenticated" };

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.authUserId, user.id))
    .limit(1);

  if (!profile) return { kind: "no-profile", authUserId: user.id };

  // One join: which roles the user holds, in which domain, and — via the role's
  // scope — what each of those roles grants. `scope` is what decides whether a
  // grant lands org-wide or only in `domain`; see `resolveGrants`.
  const rows = await db
    .select({
      role: userRoles.role,
      domain: userRoles.domain,
      scope: roles.scope,
      permissionId: rolePermissions.permissionId,
    })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.role))
    .leftJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.role))
    .where(eq(userRoles.id, profile.id));

  const roleIds = [...new Set(rows.map((r) => r.role))];
  const domainIds = [
    ...new Set(
      rows
        .map((r) => r.domain)
        .filter((d): d is NonNullable<typeof d> => d !== null),
    ),
  ];

  // A role with no grants (advisor/alumni) still produces a row, with a null
  // permission from the LEFT JOIN — drop those before resolving.
  const grantRows: GrantRow[] = rows
    .filter((r): r is typeof r & { permissionId: string } =>
      Boolean(r.permissionId),
    )
    .map((r) => ({
      permissionId: r.permissionId,
      scope: r.scope,
      domain: r.domain,
    }));

  return {
    kind: "active",
    ctx: {
      userId: profile.id,
      authUserId: user.id,
      firstName: profile.firstName,
      lastName: profile.lastName,
      status: profile.status,
      roleIds,
      domainIds,
      grants: grantRows.length ? resolveGrants(grantRows) : EMPTY_GRANTS,
    },
  };
});

/** Returns the access context only when a profile exists (any status), else null. */
export async function getAccessContext(): Promise<AccessContext | null> {
  const state = await getAuthState();
  return state.kind === "active" ? state.ctx : null;
}

/**
 * Trust-boundary guard for mutating Server Actions. Returns the access context
 * for an approved user who holds `permission`, or an `{ error }` to return to
 * the client. Every mutating Server Action must gate through this.
 *
 * The approval check has to live *here*, not only in the dashboard layout: that
 * layout never renders for a Server Action POST, and `proxy.ts` waves any
 * request carrying a `next-action` header straight through. Rejecting a member
 * also leaves their `user_roles` rows intact, so without this a removed member
 * keeps every role and every write capability they had.
 *
 * `permission` is checked with `canAny` — held globally, or in at least one
 * domain. That is a cheap precheck, not the whole story: an action that touches
 * a specific domain must ALSO call `canIn(ctx.grants, permission, domain)` once
 * it knows which domain, or a lead of `technical` could act on `creatives`.
 */
export async function requireWriteAccess(
  permission: PermissionId,
): Promise<AccessContext | { error: string }> {
  const ctx = await getAccessContext();
  if (!ctx) return { error: "You are not signed in." };
  if (ctx.status !== "approved") {
    return { error: "Your account is not approved." };
  }
  if (!canAny(ctx.grants, permission)) {
    return { error: "You are not allowed to do that." };
  }
  return ctx;
}

/**
 * Same guard, for actions whose effect is ORG-WIDE and so have no domain to
 * narrow to — rewriting the role→permission grid, or editing any member's roles
 * from the directory.
 *
 * `requireWriteAccess`'s `canAny` precheck is unsafe on its own for these: it
 * passes for a permission held through a domain-scoped role, and with no
 * follow-up `canIn` the holder acts across the whole club. Ticking
 * `member.manage` on the `lead` row would hand every lead the entire directory,
 * and ticking `role.manage` there would let them grant themselves anything.
 * Both pages already gate on global `can()`, so this only closes the gap between
 * what the page shows and what the Server Action accepts.
 */
export async function requireGlobalWriteAccess(
  permission: PermissionId,
): Promise<AccessContext | { error: string }> {
  const ctx = await getAccessContext();
  if (!ctx) return { error: "You are not signed in." };
  if (ctx.status !== "approved") {
    return { error: "Your account is not approved." };
  }
  if (!can(ctx.grants, permission)) {
    return { error: "You are not allowed to do that." };
  }
  return ctx;
}
