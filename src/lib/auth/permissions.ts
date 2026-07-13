// Scope-aware permission resolution.
//
// Free functions over plain data (not methods on AccessContext) so the grants
// stay trivially serializable across the RSC boundary and the parity harness can
// exercise them without a DB.
//
// Grants are purely ADDITIVE — there are no deny rules. That is a deliberate
// design constraint, not an omission: a grid with deny rows becomes unreadable,
// resolution order turns load-bearing, and "what can this person do?" stops
// being answerable by reading their row. It is only sound because the read-only
// roles (advisor/alumni) are enforced as EXCLUSIVE — see
// `assertExclusiveReadOnlyRole`. Break that invariant and an alumni who also
// holds `lead` silently gains write access.

import type { DomainId } from "@/lib/opus/format";
import { isDomainId } from "@/lib/opus/format";

/** A user's resolved capabilities, split by the scope that granted them. */
export type Grants = {
  /** Held via a `global`-scoped role — applies in every domain. */
  global: string[];
  /** Held via a `domain`-scoped role — applies only in that domain. */
  byDomain: Partial<Record<DomainId, string[]>>;
};

export const EMPTY_GRANTS: Grants = { global: [], byDomain: {} };

/** One `user_roles ⋈ roles ⋈ role_permissions` row. */
export type GrantRow = {
  permissionId: string;
  /** From `roles.scope` — the ONLY thing that decides how a grant applies. */
  scope: "domain" | "global";
  /** From `user_roles.domain` — nullable, and meaningless for global roles. */
  domain: string | null;
};

/**
 * Folds raw join rows into resolved grants.
 *
 * Branches on `roles.scope` and *only* on `roles.scope`. `user_roles` has no
 * CHECK constraint tying `domain` to the role's scope, so both malformed shapes
 * are representable, and inferring scope from `domain IS NULL` would turn either
 * one into a privilege bug:
 *
 *   ('lead', domain=NULL)        → would read as a GLOBAL manager (org-wide escalation)
 *   ('president', 'technical')   → would read as a technical-only manager (lockout)
 *
 * So: global rows ignore `domain` entirely, and a domain-scoped row with no
 * domain contributes nothing.
 */
export function resolveGrants(rows: GrantRow[]): Grants {
  const global = new Set<string>();
  const byDomain = new Map<DomainId, Set<string>>();

  for (const row of rows) {
    if (row.scope === "global") {
      global.add(row.permissionId);
      continue;
    }
    if (!row.domain || !isDomainId(row.domain)) continue;
    const set = byDomain.get(row.domain) ?? new Set<string>();
    set.add(row.permissionId);
    byDomain.set(row.domain, set);
  }

  return {
    global: [...global],
    byDomain: Object.fromEntries(
      [...byDomain].map(([d, set]) => [d, [...set]]),
    ) as Partial<Record<DomainId, string[]>>,
  };
}

/** Held org-wide (via a global-scoped role). */
export const can = (g: Grants, permission: string): boolean =>
  g.global.includes(permission);

/** Held in `domain` — either org-wide, or via a domain-scoped role there. */
export const canIn = (g: Grants, permission: string, domain: string): boolean =>
  g.global.includes(permission) ||
  (isDomainId(domain)
    ? (g.byDomain[domain]?.includes(permission) ?? false)
    : false);

/**
 * Held org-wide OR in at least one domain. For nav and page-level gating — "is
 * this section worth showing at all" — never for authorizing a mutation against
 * a specific domain. Use `canIn` for that.
 */
export const canAny = (g: Grants, permission: string): boolean =>
  can(g, permission) ||
  Object.values(g.byDomain).some((perms) => perms?.includes(permission));

/** Every domain where the user holds `permission` (global ⇒ all domains). */
export const domainsWith = (
  g: Grants,
  permission: string,
  allDomains: readonly DomainId[],
): DomainId[] =>
  g.global.includes(permission)
    ? [...allDomains]
    : allDomains.filter((d) => g.byDomain[d]?.includes(permission));
