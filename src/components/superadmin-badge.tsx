import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * The platform maintainer's badge. Display only — authority comes from the
 * permission grid, never from this. The text sweep is shadcn's `shimmer`
 * utility (ships with the `shadcn` package's tailwind.css) and stops for
 * reduced-motion users.
 */
export function SuperadminBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 border-primary/40 bg-primary/10 text-primary",
        className,
      )}
    >
      <ShieldCheck aria-hidden="true" />
      <span className="shimmer motion-reduce:shimmer-none">Superadmin</span>
    </Badge>
  );
}
