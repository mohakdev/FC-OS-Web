import { pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { permissions } from "./permissions";
import { roles, rolesEnum } from "./roles";

// Which capabilities each role grants. Resolution is scope-aware: a grant
// arriving via a `global`-scoped role applies org-wide, one arriving via a
// `domain`-scoped role applies only within the domain the user holds it in.
// See `src/lib/auth/permissions.ts`.
//
// The composite PK is load-bearing: migration 0003 created it, 0016 dropped it,
// and without it duplicate grants are representable and `onConflictDoNothing`
// upserts silently no-op instead of deduping.
export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: rolesEnum("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: text("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })],
);

export type RolePermission = typeof rolePermissions.$inferSelect;
export type NewRolePermission = typeof rolePermissions.$inferInsert;
