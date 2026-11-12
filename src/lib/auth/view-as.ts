// "View as": a holder of `platform.view_as` temporarily takes on one role
// (+ domain) to see and act exactly as that role would.
//
// The cookie is NOT signed, deliberately. It is honored only for a user whose
// REAL grants include `platform.view_as`, and the switched grants are always
// intersected with those real grants (`intersectGrants`), so a forged or edited
// cookie can only ever narrow what its holder may do.

import { cookies } from "next/headers";

import { type DomainId, isDomainId } from "@/lib/opus/format";
import { SUPERADMIN_ROLE } from "./catalog";

export const VIEW_AS_COOKIE = "fcos_view_as";
/** A switch lapses on its own after an hour, so it can't be forgotten on prod. */
export const VIEW_AS_MAX_AGE_S = 60 * 60;

export type ViewAs = {
  role: string;
  /** Set iff the role is domain-scoped. */
  domain: DomainId | null;
  /** Epoch ms. */
  expiresAt: number;
};

type Scopes = ReadonlyMap<string, "domain" | "global">;

/**
 * Validates a switch target: a known, app-assignable role (never superadmin),
 * with a valid domain iff the role is domain-scoped. Returns the normalized
 * target or an error string.
 */
export function validateViewAsTarget(
  role: string,
  domain: string | null,
  scopes: Scopes,
): { role: string; domain: DomainId | null } | { error: string } {
  const scope = scopes.get(role);
  if (!scope || role === SUPERADMIN_ROLE) return { error: "Unknown role." };
  if (scope === "global") return { role, domain: null };
  if (!domain || !isDomainId(domain)) {
    return { error: "Pick a domain for this role." };
  }
  return { role, domain };
}

/** Parses + validates the raw cookie value. Anything off → null (ignored). */
export function parseViewAs(
  raw: string | undefined,
  scopes: Scopes,
  now: number = Date.now(),
): ViewAs | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<ViewAs>;
    if (typeof value.role !== "string") return null;
    if (typeof value.expiresAt !== "number" || value.expiresAt <= now) {
      return null;
    }
    const target = validateViewAsTarget(
      value.role,
      typeof value.domain === "string" ? value.domain : null,
      scopes,
    );
    if ("error" in target) return null;
    return { ...target, expiresAt: value.expiresAt };
  } catch {
    return null;
  }
}

export async function readViewAsCookie(): Promise<string | undefined> {
  return (await cookies()).get(VIEW_AS_COOKIE)?.value;
}

/** Server Functions only (cookies can't be set during render). */
export async function writeViewAsCookie(target: {
  role: string;
  domain: DomainId | null;
}): Promise<void> {
  const value: ViewAs = {
    ...target,
    expiresAt: Date.now() + VIEW_AS_MAX_AGE_S * 1000,
  };
  (await cookies()).set(VIEW_AS_COOKIE, JSON.stringify(value), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: VIEW_AS_MAX_AGE_S,
  });
}

export async function clearViewAsCookie(): Promise<void> {
  (await cookies()).delete(VIEW_AS_COOKIE);
}
