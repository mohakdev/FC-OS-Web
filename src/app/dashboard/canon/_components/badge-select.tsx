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
          "h-5! gap-0.5 rounded-4xl py-0 pr-1 pl-2 data-[size=sm]:rounded-4xl dark:hover:bg-transparent [&_svg]:size-3!",
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
