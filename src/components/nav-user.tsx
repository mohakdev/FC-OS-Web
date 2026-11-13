"use client";

import { ChevronsUpDown, LogOut, Palette, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { SuperadminBadge } from "@/components/superadmin-badge";
import { ThemeMenuGroups } from "@/components/theme/theme-selector";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth/client";
import type { DomainId } from "@/lib/opus/format";
import { DOMAIN_LABELS } from "@/lib/validation/onboarding";

export type NavUserData = {
  name: string;
  email: string;
  domainIds: DomainId[];
  isSuperadmin: boolean;
};

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "FC";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "FC";
}

function DomainBadge({ domain }: { domain: DomainId }) {
  return (
    <Badge className="min-w-0 max-w-full">
      <span className="truncate">{DOMAIN_LABELS[domain]}</span>
    </Badge>
  );
}

// Sidebar row: first domain + "+N" so it fits the 16rem sidebar. The menu
// header lists every domain.
function DomainSummary({ domainIds }: { domainIds: DomainId[] }) {
  const [first, ...rest] = domainIds;
  if (!first) return null;
  return (
    <span className="flex min-w-0 items-center gap-1">
      <DomainBadge domain={first} />
      {rest.length > 0 ? (
        <Badge
          title={rest.map((d) => DOMAIN_LABELS[d]).join(", ")}
          aria-label={`${rest.length} more domain${rest.length === 1 ? "" : "s"}`}
        >
          +{rest.length}
        </Badge>
      ) : null}
    </span>
  );
}

export function NavUser({ name, email, domainIds, isSuperadmin }: NavUserData) {
  const { isMobile } = useSidebar();
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const initials = getInitials(name);

  const handleLogout = async () => {
    setLoggingOut(true);
    const { error } = await authClient.signOut();
    if (error) {
      setLoggingOut(false);
      toast.error(error.message ?? "Could not log out.");
      return;
    }
    router.replace("/");
    router.refresh();
  };

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            {/* SidebarMenuButton wraps its child in a Tooltip (no DOM node), so
                it must be the outer asChild — see ThemeSelector history. */}
            <SidebarMenuButton
              asChild
              size="lg"
              tooltip={name}
              className="h-14 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <DropdownMenuTrigger>
                <Avatar>
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <span className="flex min-w-0 flex-1 flex-col gap-1 text-left">
                  <span className="truncate font-serif text-base leading-tight">
                    {name}
                  </span>
                  {/* The 16rem row fits one badge; the menu lists domains. */}
                  {isSuperadmin ? (
                    <SuperadminBadge className="self-start" />
                  ) : (
                    <DomainSummary domainIds={domainIds} />
                  )}
                </span>
                <ChevronsUpDown className="ml-auto text-muted-foreground" />
              </DropdownMenuTrigger>
            </SidebarMenuButton>
            <DropdownMenuContent
              className="min-w-56"
              side={isMobile ? "bottom" : "right"}
              align="end"
              sideOffset={4}
            >
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1.5 py-1.5 text-left">
                  <Avatar>
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>
                  <div className="grid min-w-0 flex-1 leading-tight">
                    <span className="truncate font-serif text-base text-foreground">
                      {name}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {email}
                    </span>
                  </div>
                </div>
                {isSuperadmin || domainIds.length > 0 ? (
                  <div className="flex flex-wrap gap-1 px-1.5 pb-1.5">
                    {isSuperadmin ? <SuperadminBadge /> : null}
                    {domainIds.map((domain) => (
                      <DomainBadge key={domain} domain={domain} />
                    ))}
                  </div>
                ) : null}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/profile">
                    <UserRound />
                    Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Palette />
                    Theme
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent className="w-52">
                      <ThemeMenuGroups />
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setConfirmOpen(true)}
                >
                  <LogOut />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      {/* Lives outside the DropdownMenu so closing the menu doesn't unmount it. */}
      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!loggingOut) setConfirmOpen(open);
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Log out of FC OS?</AlertDialogTitle>
            <AlertDialogDescription>
              You'll need a new email code to sign back in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loggingOut}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={loggingOut}
              onClick={(event) => {
                // Keep the dialog open until sign-out settles.
                event.preventDefault();
                void handleLogout();
              }}
            >
              {loggingOut ? <Spinner data-icon="inline-start" /> : null}
              {loggingOut ? "Logging out…" : "Log out"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
