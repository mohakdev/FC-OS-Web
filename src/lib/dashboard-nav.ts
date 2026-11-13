import {
  AudioLines,
  BookUser,
  Bug,
  LayoutDashboard,
  type LucideIcon,
  MonitorUp,
  PersonStanding,
  ScrollText,
  ShieldCheck,
  Target,
  UserCheck,
  Users,
} from "lucide-react";

// Second-level row inside a collapsible group (e.g. an Opus domain board).
export type DashboardNavSubItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  href: string;
  // Only an exact pathname match marks the row active (for index routes whose
  // href prefixes every sibling, like the Opus overview).
  exact?: boolean;
  // Optional secondary link revealed on hover (e.g. "Manage" gear). Its route
  // also marks the row active.
  action?: { href: string; label: string; icon: LucideIcon };
};

export type DashboardNavItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  href: string;
  // Hidden from the sidebar until the tool ships.
  disabled?: boolean;
  // Only users holding this permission (globally or in some domain) see the item.
  requiresPermission?: string;
  // Sub-navigation, rendered as a collapsible group (a flyout when collapsed).
  // Usually injected at render time — see `AppSidebar`'s `navChildren`.
  children?: DashboardNavSubItem[];
};

export type DashboardNavSection = {
  id: string;
  // Omitted for the unlabeled top group.
  label?: string;
  items: DashboardNavItem[];
};

const DASHBOARD_ROOT = "/dashboard";

/**
 * Whether `href` is the current route. Prefix matching keeps a tool highlighted
 * on its nested pages (`/dashboard/canon/<id>` → Canon); the dashboard root and
 * `exact` items only match themselves.
 */
export const isNavActive = (
  href: string,
  pathname: string,
  exact = false,
): boolean =>
  pathname === href ||
  (!exact && href !== DASHBOARD_ROOT && pathname.startsWith(`${href}/`));

export const dashboardSidebarConfig: { sections: DashboardNavSection[] } = {
  sections: [
    {
      id: "overview",
      items: [
        {
          id: "dashboard",
          label: "Dashboard",
          icon: LayoutDashboard,
          href: DASHBOARD_ROOT,
        },
      ],
    },
    {
      id: "tools",
      label: "Tools",
      items: [
        {
          id: "opus",
          label: "Opus",
          icon: Target,
          href: "/dashboard/opus",
        },
        {
          id: "canon",
          label: "Canon",
          icon: ScrollText,
          href: "/dashboard/canon",
        },
        {
          id: "mom",
          label: "MoM",
          icon: AudioLines,
          href: "/dashboard/MoM",
          disabled: true,
        },
        {
          id: "attendance-tracker",
          label: "Attendance Tracker",
          icon: PersonStanding,
          href: "/dashboard/attendance-tracker",
          disabled: true,
        },
        {
          id: "fc-tv-cms",
          label: "FC TV CMS",
          icon: MonitorUp,
          href: "/dashboard/FC-TV-CMS",
          disabled: true,
        },
        {
          id: "performance-tracker",
          label: "Performance Tracker",
          icon: Users,
          href: "/dashboard/performance-tracker",
          disabled: true,
        },
        {
          id: "member-directory",
          label: "Member Directory",
          icon: BookUser,
          href: "/dashboard/member-directory",
        },
        {
          id: "bug-reports",
          label: "Bug Reports",
          icon: Bug,
          href: "/dashboard/bug-reports",
        },
      ],
    },
    {
      id: "administration",
      label: "Administration",
      items: [
        {
          id: "member-requests",
          label: "Member Requests",
          icon: UserCheck,
          href: "/dashboard/member-requests",
          requiresPermission: "member.approve",
        },
        {
          id: "role-permissions",
          label: "Roles & Permissions",
          icon: ShieldCheck,
          href: "/dashboard/settings/roles",
          requiresPermission: "role.manage",
        },
      ],
    },
  ],
};
