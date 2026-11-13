"use client";

import { badgeVariants } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Variant = NonNullable<Parameters<typeof badgeVariants>[0]>["variant"];

// SelectTrigger ships `dark:hover:bg-input/50`, which would paint over the
// badge's fill on hover. Replace it per variant with a slightly stronger tint
// of the badge's own colour, so hovering darkens the badge instead of wiping it.
const HOVER: Partial<Record<NonNullable<Variant>, string>> = {
  success: "hover:bg-success/20 dark:hover:bg-success/30",
  warning: "hover:bg-warning/20 dark:hover:bg-warning/30",
  info: "hover:bg-info/20 dark:hover:bg-info/30",
  destructive: "hover:bg-destructive/20 dark:hover:bg-destructive/30",
  secondary: "hover:bg-secondary/80 dark:hover:bg-secondary/80",
  outline: "hover:bg-muted dark:hover:bg-muted",
};

/**
 * A shadcn Select whose trigger looks like the Badge it edits, so status /
 * category pickers sit in the page exactly where the read-only badge would.
 */
export function BadgeSelect<V extends string>({
  value,
  onChange,
  options,
  variant,
  label,
}: {
  value: V;
  onChange: (v: V) => void;
  options: readonly { value: V; label: string }[];
  variant: Variant;
  label: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as V)}>
      <SelectTrigger
        size="sm"
        aria-label={label}
        className={cn(
          badgeVariants({ variant }),
          "h-5! gap-0.5 rounded-4xl py-0 pr-1 pl-2 data-[size=sm]:rounded-4xl [&_svg]:size-3!",
          HOVER[variant ?? "default"] ?? "dark:hover:bg-transparent",
          variant === "outline" ? "border-border" : "border-transparent",
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
