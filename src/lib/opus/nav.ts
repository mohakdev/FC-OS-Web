import { LayoutDashboard, Settings2 } from "lucide-react";

import type { DashboardNavSubItem } from "@/lib/dashboard-nav";
import {
  DOMAIN_IDS,
  type DomainId,
  domainIcons,
  formatDomain,
} from "@/lib/opus/format";

export type OpusNavInput = {
  // Domains the user may manage (server-computed via `manageableDomains`).
  manage: DomainId[];
  // Domains the user belongs to — listed first.
  myDomains: DomainId[];
};

// Opus sub-navigation: Overview + one board per domain (two levels, no deeper).
// Per-user, so it can't live in the static sidebar config — it is injected at
// render time through `AppSidebar`'s `navChildren` seam.
export function buildOpusNavChildren({
  manage,
  myDomains,
}: OpusNavInput): DashboardNavSubItem[] {
  const mine = new Set(myDomains);
  const ordered = [
    ...DOMAIN_IDS.filter((d) => mine.has(d)),
    ...DOMAIN_IDS.filter((d) => !mine.has(d)),
  ];

  return [
    {
      id: "opus-overview",
      label: "Overview",
      icon: LayoutDashboard,
      href: "/dashboard/opus",
      exact: true,
    },
    ...ordered.map(
      (d): DashboardNavSubItem => ({
        id: `opus-${d}`,
        label: formatDomain(d),
        icon: domainIcons[d],
        href: `/dashboard/opus/tasks/${d}`,
        action: manage.includes(d)
          ? {
              href: `/dashboard/opus/manage/${d}`,
              label: `Manage ${formatDomain(d)}`,
              icon: Settings2,
            }
          : undefined,
      }),
    ),
  ];
}
