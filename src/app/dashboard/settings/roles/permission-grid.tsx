"use client";

import { Loader2, ShieldCheck } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { isProtectedGrant } from "@/lib/auth/catalog";
import { setRolePermissions } from "./actions";

type Role = { id: string; scope: "domain" | "global" };
type Permission = { id: string; label: string; description: string | null };

export function PermissionGrid({
  roles,
  permissions,
  grid,
  currentUserRoles,
}: {
  roles: Role[];
  permissions: Permission[];
  grid: Record<string, string[]>;
  currentUserRoles: string[];
}) {
  // Draft state per role, so a row can be edited then saved as one change.
  const [draft, setDraft] = useState<Record<string, Set<string>>>(() =>
    Object.fromEntries(roles.map((r) => [r.id, new Set(grid[r.id] ?? [])])),
  );
  const [savingRole, setSavingRole] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isDirty = (roleId: string) => {
    const saved = new Set(grid[roleId] ?? []);
    const current = draft[roleId] ?? new Set();
    return (
      saved.size !== current.size || [...current].some((p) => !saved.has(p))
    );
  };

  const toggle = (roleId: string, permissionId: string) => {
    setDraft((prev) => {
      const next = new Set(prev[roleId]);
      if (next.has(permissionId)) next.delete(permissionId);
      else next.add(permissionId);
      return { ...prev, [roleId]: next };
    });
  };

  const save = (roleId: string) => {
    setSavingRole(roleId);
    startTransition(async () => {
      const result = await setRolePermissions(roleId, [
        ...(draft[roleId] ?? []),
      ]);
      setSavingRole(null);
      if ("error" in result) {
        toast.error(result.error);
        // Server rejected it — snap the row back to the persisted truth.
        setDraft((prev) => ({
          ...prev,
          [roleId]: new Set(grid[roleId] ?? []),
        }));
        return;
      }
      toast.success(`Updated ${roleId}.`);
    });
  };

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-44">Role</TableHead>
            {permissions.map((p) => (
              <TableHead key={p.id} className="text-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help text-xs">{p.label}</span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="font-mono text-xs">{p.id}</p>
                    {p.description ? <p>{p.description}</p> : null}
                  </TooltipContent>
                </Tooltip>
              </TableHead>
            ))}
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>

        <TableBody>
          {roles.map((role) => {
            const held = draft[role.id] ?? new Set<string>();
            const dirty = isDirty(role.id);
            const busy = pending && savingRole === role.id;

            return (
              <TableRow key={role.id}>
                <TableCell className="font-medium capitalize">
                  <div className="flex items-center gap-2">
                    {role.id}
                    <Badge
                      variant={
                        role.scope === "global" ? "default" : "secondary"
                      }
                    >
                      {role.scope}
                    </Badge>
                  </div>
                </TableCell>

                {permissions.map((p) => {
                  const locked = isProtectedGrant(role.id, p.id);
                  const cell = (
                    <Checkbox
                      checked={held.has(p.id)}
                      disabled={locked || busy}
                      onCheckedChange={() => toggle(role.id, p.id)}
                      aria-label={`${p.label} for ${role.id}`}
                    />
                  );
                  return (
                    <TableCell key={p.id} className="text-center">
                      <div className="flex items-center justify-center">
                        {locked ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex items-center gap-1">
                                {cell}
                                <ShieldCheck className="size-3 text-muted-foreground" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              Locked. This grant is what stops the club from
                              locking itself out of its own permissions.
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          cell
                        )}
                      </div>
                    </TableCell>
                  );
                })}

                <TableCell>
                  <Button
                    size="sm"
                    variant={dirty ? "default" : "ghost"}
                    disabled={!dirty || busy}
                    onClick={() => save(role.id)}
                  >
                    {busy ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      "Save"
                    )}
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <p className="border-t px-4 py-3 text-xs text-muted-foreground">
        Changes take effect on each member&apos;s next request — no re-login
        needed.{" "}
        {currentUserRoles.length > 0 ? (
          <>
            You hold{" "}
            <span className="font-medium text-foreground">
              {currentUserRoles.join(", ")}
            </span>
            . You can edit those rows freely — including removing role
            management — as long as one global role you hold still grants it.
          </>
        ) : null}
      </p>
    </div>
  );
}
