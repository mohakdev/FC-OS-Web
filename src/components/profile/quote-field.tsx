"use client";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { QUOTE_MAX } from "@/lib/validation/profile";

/** Display-quote textarea with a live `n/150` counter. */
export function QuoteField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between">
        <Label htmlFor={id}>Display quote</Label>
        <span
          className={cn(
            "text-xs tabular-nums text-muted-foreground",
            value.length > QUOTE_MAX && "text-destructive",
          )}
        >
          {value.length}/{QUOTE_MAX}
        </span>
      </div>
      <Textarea
        id={id}
        rows={2}
        maxLength={QUOTE_MAX}
        placeholder="Something you live by"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
