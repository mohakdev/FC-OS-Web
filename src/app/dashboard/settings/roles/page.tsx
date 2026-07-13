import { redirect } from "next/navigation";

import { db } from "@/database/db";
import { rolePermissions } from "@/database/schemas/role_permissions";
import { roles } from "@/database/schemas/roles";
import { PERMISSIONS } from "@/lib/auth/catalog";
import { getAccessContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { PermissionGrid } from "./permission-grid";

export const dynamic = "force-dynamic";

export default async function RolePermissionsPage() {
  const ctx = await getAccessContext();
  if (!ctx) redirect("/dashboard");
  // Rewriting the org's authority model is president/VP only — HRM can approve
  // and manage members but not change what any role is allowed to do.
  if (!can(ctx.grants, "role.manage")) redirect("/dashboard");

  const [roleRows, grantRows] = await Promise.all([
    db.select({ id: roles.id, scope: roles.scope }).from(roles),
    db
      .select({
        roleId: rolePermissions.roleId,
        permissionId: rolePermissions.permissionId,
      })
      .from(rolePermissions),
  ]);

  const grid: Record<string, string[]> = {};
  for (const r of grantRows) (grid[r.roleId] ??= []).push(r.permissionId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-serif text-3xl text-primary">
          Roles &amp; Permissions
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          What each role is allowed to do. A permission held through a{" "}
          <strong className="text-foreground">domain</strong> role applies only
          in the domains that person belongs to; one held through a{" "}
          <strong className="text-foreground">global</strong> role applies
          across the whole club.
        </p>
      </div>

      <PermissionGrid
        roles={roleRows.map((r) => ({ id: r.id as string, scope: r.scope }))}
        permissions={PERMISSIONS.map((p) => ({
          id: p.id,
          label: p.label,
          description: p.description,
        }))}
        grid={grid}
        currentUserRoles={ctx.roleIds}
      />
    </div>
  );
}
