"use client";

import { useMemo, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { splitByTime } from "@/lib/forum/format";
import { DOMAIN_IDS, formatDomain } from "@/lib/opus/format";
import { EventCard, type EventCardData } from "./event-card";

/** "mine" = meetings I'm expected at; "club" = full-team; else a domain. */
type Filter = "mine" | "all" | "club" | (typeof DOMAIN_IDS)[number];

export function EventList({
  events,
  myDomains,
}: {
  events: EventCardData[];
  myDomains: string[];
}) {
  const [filter, setFilter] = useState<Filter>("mine");

  const { upcoming, past } = useMemo(() => {
    const matches = (e: EventCardData) => {
      switch (filter) {
        case "all":
          return true;
        case "mine":
          return (
            e.kind === "club_meeting" ||
            (e.domain !== null && myDomains.includes(e.domain))
          );
        case "club":
          return e.kind === "club_meeting";
        default:
          return e.domain === filter;
      }
    };
    return splitByTime(events.filter(matches));
  }, [events, filter, myDomains]);

  const grid = (list: EventCardData[], empty: string) =>
    list.length === 0 ? (
      <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
        {empty}
      </p>
    ) : (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((e) => (
          <EventCard key={e.id} event={e} />
        ))}
      </div>
    );

  return (
    <Tabs defaultValue="upcoming" className="gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TabsList>
          <TabsTrigger value="upcoming">
            Upcoming <span className="tabular-nums">({upcoming.length})</span>
          </TabsTrigger>
          <TabsTrigger value="past">
            Past <span className="tabular-nums">({past.length})</span>
          </TabsTrigger>
        </TabsList>
        <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <SelectTrigger className="w-48" aria-label="Filter meetings">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="mine">My meetings</SelectItem>
            <SelectItem value="all">Everything</SelectItem>
            <SelectItem value="club">Full-team meetings</SelectItem>
            {DOMAIN_IDS.map((d) => (
              <SelectItem key={d} value={d}>
                {formatDomain(d)} meetings
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <TabsContent value="upcoming">
        {grid(upcoming, "Nothing coming up.")}
      </TabsContent>
      <TabsContent value="past">{grid(past, "No past meetings.")}</TabsContent>
    </Tabs>
  );
}
