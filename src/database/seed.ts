// Seeds the data-driven reference tables (`domains`, `roles`, `permissions`,
// `role_permissions`) that the rest of the RBAC model and onboarding depend on.
// Idempotent: safe to re-run.
//
//   bun run seed   (see package.json — runs this via tsx)
import "dotenv/config";

import {
  PERMISSION_IDS,
  PERMISSIONS,
  type PermissionId,
} from "@/lib/auth/catalog";
import { db } from "./db";
import { canonCategories } from "./schemas/canon_categories";
import { domains } from "./schemas/domains";
import { opusPriorities } from "./schemas/opus_priorities";
import { opusStatuses } from "./schemas/opus_statuses";
import { permissions } from "./schemas/permissions";
import { rolePermissions } from "./schemas/role_permissions";
import { roles, type rolesEnum } from "./schemas/roles";

const DOMAIN_IDS = [
  "technical",
  "creatives",
  "operations",
  "outreach",
] as const;

// `global` roles are not tied to a domain (leadership + HRM); everyone else is
// scoped to the domain(s) they belong to.
const ROLES = [
  { id: "member", scope: "domain" },
  { id: "associate lead", scope: "domain" },
  { id: "co-lead", scope: "domain" },
  { id: "lead", scope: "domain" },
  { id: "human resource manager", scope: "global" },
  { id: "vice president", scope: "global" },
  { id: "president", scope: "global" },
  // Read-only roles, not tied to a domain.
  { id: "advisor", scope: "global" },
  { id: "alumni", scope: "global" },
  // Platform maintainer. Assigned in the DB only.
  { id: "superadmin", scope: "global" },
] as const;

// The role→permission grid. Reproduces the behaviour of the hardcoded role sets
// this model replaces, exactly:
//
//   APPROVER_ROLES      (HRM/VP/president)              → member.*
//   DOMAIN_MANAGER_ROLES(lead/co-lead/associate lead)   → opus.task.manage + opus.config.manage
//   READ_ONLY_ROLES     (advisor/alumni)                → nothing at all
//
// Scope does the domain-narrowing for free: a grant held via a `domain`-scoped
// role (member…lead) applies only in that user's domains, while one held via a
// `global`-scoped role (HRM/VP/president) applies org-wide. That is why
// approvers can manage every domain's board and a lead only their own.
//
// `role.manage` is deliberately NOT given to HRM: they approve members, but
// rewriting the org's authority model is president/VP only.
const OPUS_MANAGER: PermissionId[] = [
  "opus.task.manage",
  "opus.config.manage",
  "opus.task.status.own",
];

// Every approved non-read-only member may edit the Canon events they are a
// SPOC on. Being a SPOC is the relationship; this is the capability behind it.
const CANON_SPOC: PermissionId[] = ["canon.event.edit.own"];

// Forum: domain leads run their own domain's meetings (scope narrows it);
// leadership runs full-team meetings and, via its global roles, every domain's.
const FORUM_DOMAIN: PermissionId[] = ["forum.domain.manage"];
const FORUM_LEADERSHIP: PermissionId[] = [
  "forum.domain.manage",
  "forum.club.manage",
];

const APPROVER: PermissionId[] = [
  "member.approve",
  "member.manage",
  "member.remove",
  ...OPUS_MANAGER,
  ...CANON_SPOC,
  "canon.event.manage",
  ...FORUM_LEADERSHIP,
];

type RoleId = (typeof rolesEnum.enumValues)[number];

const BASE_GRANTS: Record<RoleId, PermissionId[]> = {
  member: ["opus.task.status.own", ...CANON_SPOC],
  "associate lead": [...OPUS_MANAGER, ...CANON_SPOC, ...FORUM_DOMAIN],
  "co-lead": [...OPUS_MANAGER, ...CANON_SPOC, ...FORUM_DOMAIN],
  lead: [...OPUS_MANAGER, ...CANON_SPOC, ...FORUM_DOMAIN],
  "human resource manager": APPROVER,
  "vice president": [...APPROVER, "role.manage", "bug.manage"],
  president: [...APPROVER, "role.manage", "bug.manage"],
  // Read-only roles hold nothing. This is only sound because they are exclusive
  // (see `assertExclusiveReadOnlyRole` in dbActions) — an alumni who also held
  // `lead` would gain write access under an additive union of grants, where
  // today the `isReadOnly` deny-override blocks them.
  advisor: [],
  alumni: [],
  // Every permission, including any added later (re-run the seed). The whole
  // row is protected in `catalog.ts`, so the grid shows it locked.
  superadmin: [...PERMISSION_IDS],
};

const DEFAULT_STATUSES = [
  { name: "Backlog", position: 0, color: "#6b7280", ringFull: false },
  { name: "Todo", position: 1, color: "#3b82f6", ringFull: false },
  { name: "In Progress", position: 2, color: "#f59e0b", ringFull: false },
  { name: "Done", position: 3, color: "#22c55e", ringFull: true },
  { name: "Cancelled", position: 4, color: "#ef4444", ringFull: true },
] as const;

// Dynamic priorities first (ascending severity → more bars lit), fixed ones last —
// mirrors the statuses convention. Low fills 1 bar, High fills all dynamic bars,
// Urgent is a static fully-lit red icon.
const DEFAULT_PRIORITIES = [
  { name: "Low", position: 0, ringFull: false },
  { name: "Medium", position: 1, ringFull: false },
  { name: "High", position: 2, ringFull: false },
  { name: "Urgent", position: 3, ringFull: true },
] as const;

const DEFAULT_CANON_CATEGORIES = [
  "Ideathon",
  "Hackathon",
  "Startupathon",
  "InterClub",
] as const;

async function seed() {
  await db
    .insert(domains)
    .values(DOMAIN_IDS.map((id) => ({ id })))
    .onConflictDoNothing();

  await db
    .insert(roles)
    .values(ROLES.map((r) => ({ id: r.id, scope: r.scope })))
    .onConflictDoNothing();

  await db
    .insert(permissions)
    .values(
      PERMISSIONS.map((p) => ({
        id: p.id,
        label: p.label,
        description: p.description,
      })),
    )
    .onConflictDoNothing();

  // `member.approve` for lead/co-lead is NOT seeded: it is an org decision made
  // in the permission grid (/dashboard/settings/roles). `onConflictDoNothing`
  // below never strips grants, so re-seeding keeps whatever the grid says.
  const grants = (Object.keys(BASE_GRANTS) as RoleId[]).flatMap((roleId) =>
    BASE_GRANTS[roleId].map((permissionId) => ({ roleId, permissionId })),
  );

  await db.insert(rolePermissions).values(grants).onConflictDoNothing();

  console.log(
    `Seeded ${PERMISSIONS.length} permissions + ${grants.length} role grants.`,
  );

  for (const domainId of DOMAIN_IDS) {
    await db
      .insert(opusStatuses)
      .values(
        DEFAULT_STATUSES.map((s) => ({
          domain: domainId,
          name: s.name,
          position: s.position,
          color: s.color,
          ringFull: s.ringFull,
          isDefault: true,
        })),
      )
      .onConflictDoNothing();

    await db
      .insert(opusPriorities)
      .values(
        DEFAULT_PRIORITIES.map((p) => ({
          domain: domainId,
          name: p.name,
          position: p.position,
          ringFull: p.ringFull,
          isDefault: true,
        })),
      )
      .onConflictDoNothing();
  }

  await db
    .insert(canonCategories)
    .values(
      DEFAULT_CANON_CATEGORIES.map((name, position) => ({ name, position })),
    )
    .onConflictDoNothing();

  console.log(
    "Seeded domains + roles + permissions + opus statuses + priorities + canon categories.",
  );
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
