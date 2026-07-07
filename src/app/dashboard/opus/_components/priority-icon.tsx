// Bar-graph priority icon: a row of ascending-height bars. The first `filled` bars are
// lit; the rest are faint. Conveys a priority's rank among the dynamic priorities — e.g.
// 3 dynamic priorities light 1 / 2 / 3 bars. A `fixed` priority (e.g. Urgent) renders
// every bar lit in red as a static "top priority" marker. Mirrors StatusIcon.

import { cn } from "@/lib/utils";

export function PriorityIcon({
  filled,
  bars,
  fixed = false,
  size = 14,
  label,
  className,
}: {
  filled: number;
  bars: number;
  fixed?: boolean;
  size?: number;
  /** Accessible name (e.g. the priority name). When set the icon is exposed to screen
   * readers; otherwise it's decorative (hidden) — use where adjacent text names it. */
  label?: string;
  className?: string;
}) {
  const count = Math.max(1, bars);
  const lit = fixed ? count : filled;

  return (
    <span
      role="img"
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn(
        "inline-flex shrink-0 items-end gap-[2px]",
        fixed ? "text-destructive" : "text-foreground",
        className,
      )}
      style={{ height: size }}
    >
      {Array.from({ length: count }, (_, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length positional bars
          key={i}
          className="w-[3px] rounded-[1px] bg-current"
          style={{
            height: `${((i + 1) / count) * 100}%`,
            opacity: i < lit ? 1 : 0.28,
          }}
        />
      ))}
    </span>
  );
}
