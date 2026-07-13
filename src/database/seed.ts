// Seeds the data-driven reference tables (`domains`, `roles`, `permissions`,
// `role_permissions`) that the rest of the RBAC model and onboarding depend on.
// Idempotent: safe to re-run.
//
//   bun run seed   (see package.json — runs this via tsx)
import "dotenv/config";

import { PERMISSIONS, type PermissionId } from "@/lib/auth/catalog";
import { db } from "./db";
import { appSettings } from "./schemas/app_settings";
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
] as const;

// The role→permission grid. Reproduces the behaviour of the hardcoded role sets
// this model replaces, exactly:
//
//   APPROVER_ROLES      (HRM/VP/president)              → member.* + settings.manage
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

const APPROVER: PermissionId[] = [
  "member.approve",
  "member.manage",
  "member.remove",
  "settings.manage",
  ...OPUS_MANAGER,
];

type RoleId = (typeof rolesEnum.enumValues)[number];

const BASE_GRANTS: Record<RoleId, PermissionId[]> = {
  member: ["opus.task.status.own"],
  "associate lead": OPUS_MANAGER,
  "co-lead": OPUS_MANAGER,
  lead: OPUS_MANAGER,
  "human resource manager": APPROVER,
  "vice president": [...APPROVER, "role.manage"],
  president: [...APPROVER, "role.manage"],
  // Read-only roles hold nothing. This is only sound because they are exclusive
  // (see `assertExclusiveReadOnlyRole` in dbActions) — an alumni who also held
  // `lead` would gain write access under an additive union of grants, where
  // today the `isReadOnly` deny-override blocks them.
  advisor: [],
  alumni: [],
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

async function seed() {
  await db
    .insert(domains)
    .values(DOMAIN_IDS.map((id) => ({ id })))
    .onConflictDoNothing();

  await db
    .insert(roles)
    .values(ROLES.map((r) => ({ id: r.id, scope: r.scope })))
    .onConflictDoNothing();

  // Singleton settings row (id=1), defaults applied by the schema.
  await db.insert(appSettings).values({ id: 1 }).onConflictDoNothing();

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

  // `member.approve` for domain leads is the `domainLeadsCanApprove` toggle in
  // permission form. Seed it from the LIVE setting, never a hardcoded default —
  // the flag is currently ON in production, so assuming `false` here would
  // silently strip approval rights from every lead in the club.
  const [settings] = await db
    .select({ domainLeadsCanApprove: appSettings.domainLeadsCanApprove })
    .from(appSettings)
    .limit(1);
  const domainLeadsCanApprove = settings?.domainLeadsCanApprove ?? false;

  const grants = (Object.keys(BASE_GRANTS) as RoleId[]).flatMap((roleId) => {
    const perms = BASE_GRANTS[roleId];
    const effective: PermissionId[] =
      domainLeadsCanApprove && (roleId === "lead" || roleId === "co-lead")
        ? [...perms, "member.approve"]
        : perms;
    return effective.map((permissionId) => ({ roleId, permissionId }));
  });

  await db.insert(rolePermissions).values(grants).onConflictDoNothing();

  console.log(
    `Seeded ${PERMISSIONS.length} permissions + ${grants.length} role grants ` +
      `(domainLeadsCanApprove=${domainLeadsCanApprove}).`,
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

  console.log(
    "Seeded domains + roles + permissions + settings + opus statuses + priorities.",
  );
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
