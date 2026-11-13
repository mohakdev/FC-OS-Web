import { cn } from "@/lib/utils";

/**
 * Canon-only "ghost" field style: shadcn Input/Textarea with no border, no
 * fill and no ring, so the editor reads like the page it edits. A faint wash
 * on hover/focus is the only hint it's editable. Pass the typography of the
 * text it replaces (incl. the `md:` size, which the base Input/Textarea pins).
 */
export const ghost = (...extra: (string | false | undefined)[]) =>
  cn(
    "h-auto min-h-0 rounded-md border-0 bg-transparent px-1.5 -mx-1.5 py-0.5 shadow-none",
    "dark:bg-transparent hover:bg-muted/50 focus-visible:bg-muted/70 focus-visible:ring-0",
    "placeholder:text-muted-foreground/50",
    ...extra,
  );
