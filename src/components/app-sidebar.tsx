"use client";

import { ChevronRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ComponentProps, useEffect, useState } from "react";
import { NavUser, type NavUserData } from "@/components/nav-user";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  type DashboardNavItem,
  type DashboardNavSubItem,
  dashboardSidebarConfig,
  isNavActive,
} from "@/lib/dashboard-nav";
import type { DomainId } from "@/lib/opus/format";
import { buildOpusNavChildren } from "@/lib/opus/nav";
import { cn } from "@/lib/utils";

const isSubActive = (item: DashboardNavSubItem, pathname: string) =>
  isNavActive(item.href, pathname, item.exact) ||
  (item.action ? isNavActive(item.action.href, pathname) : false);

// Top-level link row, with an optional count badge.
function NavLeaf({
  item,
  pathname,
  count,
}: {
  item: DashboardNavItem;
  pathname: string;
  count?: number;
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        tooltip={item.label}
        isActive={isNavActive(item.href, pathname)}
      >
        <Link href={item.href}>
          <item.icon />
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
      {count ? <SidebarMenuBadge>{count}</SidebarMenuBadge> : null}
    </SidebarMenuItem>
  );
}

// Second-level row, plus an optional hover action (e.g. the Opus "Manage"
// gear) that stays visible on touch screens.
//
// Hover is owned by the whole <li> (`group-hover/menu-sub-item`), not the link:
// the gear overlays the row's right edge, so with plain `:hover` the row's
// background dropped out the moment the pointer reached the gear. The <li>'s
// `py-0.5` (instead of the list's `gap-1`) keeps the hover area continuous
// between rows, so the background doesn't blink off while moving down the list.
function NavSubRow({
  item,
  pathname,
}: {
  item: DashboardNavSubItem;
  pathname: string;
}) {
  const actionActive = item.action
    ? isNavActive(item.action.href, pathname)
    : false;

  return (
    <SidebarMenuSubItem className="py-0.5">
      <SidebarMenuSubButton
        asChild
        isActive={isSubActive(item, pathname)}
        className={cn(
          "group-hover/menu-sub-item:bg-sidebar-accent group-hover/menu-sub-item:text-sidebar-accent-foreground",
          item.action && "pr-8",
        )}
      >
        <Link href={item.href}>
          <item.icon />
          <span>{item.label}</span>
        </Link>
      </SidebarMenuSubButton>
      {item.action ? (
        <SidebarMenuAction
          asChild
          // Not "menu-action": the primitive pads any SidebarMenuButton whose
          // <li> *contains* a menu-action (`group-has-…/menu-item:pr-8`), which
          // matched these nested gears and slid the Opus chevron left on open.
          data-sidebar="menu-sub-action"
          data-active={actionActive || undefined}
          className="top-1.5 text-sidebar-foreground/70 group-focus-within/menu-sub-item:opacity-100 group-hover/menu-sub-item:opacity-100 hover:bg-transparent hover:text-sidebar-accent-foreground data-active:opacity-100 md:opacity-0"
        >
          <Link
            href={item.action.href}
            aria-label={item.action.label}
            title={item.action.label}
          >
            <item.action.icon />
          </Link>
        </SidebarMenuAction>
      ) : null}
    </SidebarMenuSubItem>
  );
}

// Collapsible group (sidebar-07 pattern: the row toggles its sub-list). In
// icon mode the sub-list can't render, so the row becomes a flyout menu.
function NavGroup({
  item,
  items,
  pathname,
}: {
  item: DashboardNavItem;
  items: DashboardNavSubItem[];
  pathname: string;
}) {
  const { state, isMobile } = useSidebar();
  const branchActive = isNavActive(item.href, pathname);
  const [open, setOpen] = useState(branchActive);

  // Entering the section from elsewhere (e.g. an in-page link) expands it.
  useEffect(() => {
    if (branchActive) setOpen(true);
  }, [branchActive]);

  if (state === "collapsed" && !isMobile) {
    const actions = items.flatMap((sub) => (sub.action ? [sub.action] : []));
    return (
      <SidebarMenuItem>
        <DropdownMenu>
          {/* SidebarMenuButton wraps its child in a Tooltip (no DOM node), so
              it must be the outer asChild. */}
          <SidebarMenuButton
            asChild
            tooltip={item.label}
            isActive={branchActive}
          >
            <DropdownMenuTrigger>
              <item.icon />
              <span>{item.label}</span>
            </DropdownMenuTrigger>
          </SidebarMenuButton>
          <DropdownMenuContent
            side="right"
            align="start"
            sideOffset={4}
            className="min-w-48"
          >
            <DropdownMenuLabel>{item.label}</DropdownMenuLabel>
            <DropdownMenuGroup>
              {items.map((sub) => (
                <DropdownMenuItem key={sub.id} asChild>
                  <Link
                    href={sub.href}
                    aria-current={
                      isSubActive(sub, pathname) ? "page" : undefined
                    }
                  >
                    <sub.icon />
                    {sub.label}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            {actions.length > 0 ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  {actions.map((action) => (
                    <DropdownMenuItem key={action.href} asChild>
                      <Link href={action.href}>
                        <action.icon />
                        {action.label}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    );
  }

  return (
    <Collapsible
      asChild
      open={open}
      onOpenChange={setOpen}
      className="group/collapsible"
    >
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          {/* Highlight the parent only while its active child is hidden. */}
          <SidebarMenuButton
            tooltip={item.label}
            isActive={branchActive && !open}
          >
            <item.icon />
            <span>{item.label}</span>
            <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub className="gap-0">
            {items.map((sub) => (
              <NavSubRow key={sub.id} item={sub} pathname={pathname} />
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

export type SidebarNavData = {
  manageableDomains?: DomainId[];
  myDomains?: DomainId[];
  pendingRequests?: number;
};

export function AppSidebar({
  permissions = [],
  user,
  navData,
  ...props
}: ComponentProps<typeof Sidebar> & {
  // Every permission the user holds, globally or in any domain. Nav items gate
  // on `requiresPermission`; a domain lead granted `member.approve` sees Member
  // Requests exactly as an HRM does, with no special case.
  permissions?: string[];
  user: NavUserData;
  // Serializable inputs for dynamic sub-nav and badges (icons are attached
  // client-side here, never passed across the RSC boundary).
  navData?: SidebarNavData;
}) {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();

  // The mobile sidebar is a Sheet over the page — close it once a link lands.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run on route change
  useEffect(() => {
    if (isMobile) setOpenMobile(false);
  }, [pathname, isMobile, setOpenMobile]);

  // Per-product dynamic sub-nav, keyed by nav-item id. Built client-side so
  // Lucide icon components never cross the server→client boundary.
  const navChildren: Record<string, DashboardNavSubItem[]> = {
    opus: buildOpusNavChildren({
      manage: navData?.manageableDomains ?? [],
      myDomains: navData?.myDomains ?? [],
    }),
  };
  // Count badges on top-level rows, keyed by nav-item id.
  const navCounts: Record<string, number | undefined> = {
    "member-requests": navData?.pendingRequests,
  };

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              size="lg"
              tooltip="Founders Club"
              className="group-data-[collapsible=icon]:justify-center"
            >
              <Link href="/dashboard">
                <Image
                  src="/FCLogo.svg"
                  width={20}
                  height={25}
                  alt=""
                  className="h-6 w-auto shrink-0"
                />
                <span className="truncate font-serif text-2xl leading-none group-data-[collapsible=icon]:hidden">
                  Founders Club
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {dashboardSidebarConfig.sections.map((section) => {
          const items = section.items.filter(
            (item) =>
              !item.disabled &&
              (!item.requiresPermission ||
                permissions.includes(item.requiresPermission)),
          );
          if (items.length === 0) return null;
          return (
            <SidebarGroup key={section.id}>
              {section.label ? (
                <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
              ) : null}
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => {
                    const subItems = navChildren[item.id] ?? item.children;
                    return subItems?.length ? (
                      <NavGroup
                        key={item.id}
                        item={item}
                        items={subItems}
                        pathname={pathname}
                      />
                    ) : (
                      <NavLeaf
                        key={item.id}
                        item={item}
                        pathname={pathname}
                        count={navCounts[item.id]}
                      />
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter>
        <NavUser {...user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
