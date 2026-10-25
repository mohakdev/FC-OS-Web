"use client";

import { useParams } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { domainIcons, formatDomain, isDomainId } from "@/lib/opus/format";

// Board-shaped fallback for switching domains. Sitting at the `[domain]` segment
// (below the shared opus layout), it's prefetched by the sidebar links, so a
// domain switch paints this immediately while the board data streams in.
// Mirrors KanbanBoard's layout so nothing shifts when the real board swaps in.

// Uneven card counts per column so the placeholder doesn't read as a grid.
const CARD_COUNTS = [3, 2, 4, 1];

export default function TasksLoading() {
  const { domain } = useParams<{ domain: string }>();
  const DomainIcon = isDomainId(domain) ? domainIcons[domain] : null;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-hidden">
      <div className="flex shrink-0 items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg border bg-card text-primary">
            {DomainIcon && <DomainIcon className="size-5" />}
          </span>
          <div>
            {DomainIcon ? (
              <h1 className="font-serif text-3xl text-primary">
                {formatDomain(domain)}
              </h1>
            ) : (
              <Skeleton className="h-9 w-40" />
            )}
            <Skeleton className="mt-1 h-4 w-16" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-2 overflow-hidden pb-3">
        {CARD_COUNTS.map((count, col) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder list
            key={col}
            className="flex w-80 shrink-0 flex-col"
          >
            <div className="mb-2 flex items-center gap-2 px-1">
              <Skeleton className="size-4 rounded-full" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-5 rounded-full" />
            </div>
            <div className="flex flex-col gap-2 p-2">
              {Array.from({ length: count }, (_, i) => (
                <Skeleton
                  // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder list
                  key={i}
                  className="h-24 rounded-lg"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
