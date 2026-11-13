import { Badge } from "@/components/ui/badge";
import { feeLabel, isFeeTbd } from "@/lib/canon/format";

/** Registration fee badge; amber when the event is paid but the fee isn't set yet. */
export function FeeBadge({
  isPaid,
  fee,
}: {
  isPaid: boolean;
  fee: number | null;
}) {
  return (
    <Badge variant={isFeeTbd(isPaid, fee) ? "warning" : "leadershipDashBadge"}>
      {feeLabel(isPaid, fee)}
    </Badge>
  );
}
