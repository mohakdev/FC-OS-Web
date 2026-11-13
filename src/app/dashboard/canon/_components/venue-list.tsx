"use client";

import { ArrowDown, ArrowUp, MapPin, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VENUE_STATUS_META, VENUE_STATUSES } from "@/lib/canon/constants";
import { BadgeSelect } from "./badge-select";
import { type Draft, move, newVenue } from "./draft";
import { ghost } from "./ghost";

export function VenueList({
  d,
  editing,
  set,
}: {
  d: Draft;
  editing: boolean;
  set: (patch: Partial<Draft>) => void;
}) {
  const venues = d.venues;
  const update = (i: number, patch: Partial<(typeof venues)[number]>) =>
    set({ venues: venues.map((v, j) => (j === i ? { ...v, ...patch } : v)) });

  if (!editing && venues.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Venue not decided yet.</p>
    );
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {venues.map((v, i) => (
        <li
          key={v.key}
          className="group flex flex-wrap items-center gap-2 text-sm"
        >
          <MapPin className="size-4 shrink-0 text-muted-foreground" />
          {editing ? (
            <>
              <Input
                aria-label="Venue name"
                placeholder="Venue name"
                value={v.name}
                onChange={(e) => update(i, { name: e.target.value })}
                className={ghost("w-56 text-sm font-medium md:text-sm")}
              />
              <Input
                aria-label="Applies to days"
                placeholder="Days (optional)"
                value={v.days ?? ""}
                onChange={(e) => update(i, { days: e.target.value })}
                className={ghost(
                  "w-36 text-sm text-muted-foreground md:text-sm",
                )}
              />
              <BadgeSelect
                label="Venue status"
                variant={VENUE_STATUS_META[v.status].variant}
                value={v.status}
                onChange={(status) => update(i, { status })}
                options={VENUE_STATUSES.map((s) => ({
                  value: s,
                  label: VENUE_STATUS_META[s].label,
                }))}
              />
              <span className="flex items-center opacity-60 group-hover:opacity-100">
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6"
                  aria-label="Move up"
                  disabled={i === 0}
                  onClick={() => set({ venues: move(venues, i, -1) })}
                >
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6"
                  aria-label="Move down"
                  disabled={i === venues.length - 1}
                  onClick={() => set({ venues: move(venues, i, 1) })}
                >
                  <ArrowDown className="size-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6"
                  aria-label="Remove venue"
                  onClick={() =>
                    set({ venues: venues.filter((_, j) => j !== i) })
                  }
                >
                  <X className="size-3.5" />
                </Button>
              </span>
            </>
          ) : (
            <>
              <span className="font-medium">{v.name}</span>
              {v.days && (
                <span className="text-muted-foreground">· {v.days}</span>
              )}
              <Badge variant={VENUE_STATUS_META[v.status].variant}>
                {VENUE_STATUS_META[v.status].label}
              </Badge>
            </>
          )}
        </li>
      ))}
      {editing && (
        <li>
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 text-muted-foreground"
            onClick={() => set({ venues: [...venues, newVenue()] })}
          >
            <Plus className="size-4" />
            Add venue
          </Button>
        </li>
      )}
    </ul>
  );
}
