// Opus authorization. Thin wrappers over the permission model
// (`src/lib/auth/permissions.ts`) — kept as named helpers because the call sites
// read better as `canManageDomain(ctx, d)` than as a raw permission string, and
// because it keeps the permission ids in one place if they're ever renamed.
//
// Pure functions over the AccessContext — safe to import on the server (layout,
// Server Actions).

import type { AccessContext } from "@/lib/auth/context";
import { canIn, domainsWith } from "@/lib/auth/permissions";
import { DOMAIN_IDS, type DomainId } from "@/lib/opus/format";

/**
 * Can the user create/edit/delete tasks in this domain?
 *
 * Domain narrowing is now a property of the grant, not of an explicit check: a
 * lead holds `opus.task.manage` via a `domain`-scoped role, so it resolves only
 * in the domains where they hold that role. An approver holds it via a
 * `global`-scoped role, so it resolves everywhere. That replaces the old
 * `isApprover || (hasManagerRole && ctx.domainIds.includes(domain))` — which
 * unioned domains across ALL of a user's roles, and so let a manager in one
 * domain manage a domain where they were only a plain member.
 */
export const canManageDomain = (ctx: AccessContext, domain: string): boolean =>
  canIn(ctx.grants, "opus.task.manage", domain);

/** Domains whose Manage area (statuses/priorities/labels) the user may open. */
export const manageableDomains = (ctx: AccessContext): DomainId[] =>
  domainsWith(ctx.grants, "opus.config.manage", DOMAIN_IDS);

/** Can the user edit a domain's statuses / priorities / labels? */
export const canManageConfig = (ctx: AccessContext, domain: string): boolean =>
  canIn(ctx.grants, "opus.config.manage", domain);

/**
 * Can the user change a specific task's status? Managers can change any task in
 * their domain; everyone else only tasks they are assigned to. Status is the
 * *only* field an assigned non-manager may change — full edits are
 * `canManageDomain`.
 *
 * The assignee clause is gated on a real capability (`opus.task.status.own`)
 * rather than on assignment alone. Assignment is a *relationship*, not a
 * permission: without the capability check, any user who somehow appeared in an
 * assignee list — including a read-only advisor — could mutate the task.
 */
export const canChangeTaskStatus = (
  ctx: AccessContext,
  domain: string,
  assigneeIds: string[],
): boolean =>
  canManageDomain(ctx, domain) ||
  (canIn(ctx.grants, "opus.task.status.own", domain) &&
    assigneeIds.includes(ctx.userId));
