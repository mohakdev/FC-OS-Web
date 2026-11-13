import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import DynamicBreadcrumb from "@/components/DynamicBreadcrumb";
import { RealtimeProvider } from "@/components/realtime/realtime-provider";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ViewAsToolbar } from "@/components/view-as-toolbar";
import { rolesEnum } from "@/database/schemas/roles";
import { SUPERADMIN_ROLE } from "@/lib/auth/catalog";
import { getAuthState } from "@/lib/auth/context";
import { allPermissions, can, canAny } from "@/lib/auth/permissions";
import { getRoleScopes } from "@/lib/auth/roles";
import { isDomainId } from "@/lib/opus/format";
import { manageableDomains } from "@/lib/opus/permissions";
import { getPendingMembersFor } from "@/utils/dbActions";

export const metadata: Metadata = {
  title: "FC OS • Dashboard",
  description: "The Founders Operating System",
};

type RoleId = (typeof rolesEnum.enumValues)[number];
const ROLE_ORDER: readonly RoleId[] = rolesEnum.enumValues;

// Reads the session, so this subtree must render dynamically.
export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // `proxy.ts` already blocks anonymous requests; this enforces the
  // onboarding/approval state machine and derives approver visibility.
  const state = await getAuthState();
  if (state.kind === "unauthenticated") redirect("/login");
  if (state.kind === "no-profile") redirect("/onboarding");
  if (state.ctx.status !== "approved") redirect("/pending");

  // Only plain serializable data may cross the RSC boundary into the client
  // sidebar — never built nav nodes (Lucide icons are functions). The sidebar
  // assembles the dynamic sub-nav from these ids client-side.
  const user = {
    name: `${state.ctx.firstName} ${state.ctx.lastName}`.trim() || "Member",
    email: state.ctx.email,
    domainIds: state.ctx.domainIds.filter(isDomainId),
  };
  // Sidebar badge. Re-runs on every realtime `router.refresh()`, so it stays live.
  const pendingRequests = canAny(state.ctx.grants, "member.approve")
    ? (await getPendingMembersFor(state.ctx.grants)).length
    : 0;
  const navData = {
    manageableDomains: manageableDomains(state.ctx),
    myDomains: user.domainIds,
    pendingRequests,
  };

  // "View as" toolbar: gated on the REAL grants, so it stays while switched.
  const viewAsRoles = can(state.ctx.realGrants, "platform.view_as")
    ? [...(await getRoleScopes())]
        .filter(([id]) => id !== SUPERADMIN_ROLE)
        .map(([id, scope]) => ({ id, scope }))
        .sort(
          (a, b) =>
            ROLE_ORDER.indexOf(a.id as RoleId) -
            ROLE_ORDER.indexOf(b.id as RoleId),
        )
    : null;

  return (
    <TooltipProvider>
      <RealtimeProvider>
        {/* Pin the shell to the viewport so pages scroll inside the content
            area (and Opus columns scroll individually) instead of the document. */}
        <SidebarProvider className="h-svh">
          <AppSidebar
            collapsible={"icon"}
            permissions={allPermissions(state.ctx.grants)}
            user={user}
            navData={navData}
          />
          <SidebarInset className="min-h-0 min-w-0 overflow-hidden">
            <header className="flex h-16 shrink-0 items-center gap-2">
              <div className="flex items-center gap-2 px-4">
                <SidebarTrigger className="-ml-1 rounded-full" />
                <Separator orientation="vertical" className="" />
                <DynamicBreadcrumb />
              </div>
            </header>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-4 pt-0">
              {children}
            </div>
          </SidebarInset>
        </SidebarProvider>
        {viewAsRoles ? (
          <ViewAsToolbar roles={viewAsRoles} viewAs={state.ctx.viewAs} />
        ) : null}
      </RealtimeProvider>
    </TooltipProvider>
  );
}
