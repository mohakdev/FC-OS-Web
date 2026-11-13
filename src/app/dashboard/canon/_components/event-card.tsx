import { CalendarDays } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DATE_STATUS_META } from "@/lib/canon/constants";
import { formatRange, participationLabel } from "@/lib/canon/format";
import type { CanonEventCard } from "@/utils/canonDbActions";
import { FeeBadge } from "./fee-badge";

export function EventCard({ event }: { event: CanonEventCard }) {
  const date = event.eventDate;
  return (
    <Link
      href={`/dashboard/canon/${event.id}`}
      className="rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Card className="h-full transition-colors hover:bg-accent/40">
        <CardHeader>
          <CardTitle className="font-serif text-3xl">{event.name}</CardTitle>
          <CardDescription className="flex flex-wrap gap-1 mt-1">
            <Badge variant="default">{event.categoryName}</Badge>
            {event.status === "draft" && (
              <Badge variant="destructive">Draft</Badge>
            )}
            <FeeBadge isPaid={event.isPaid} fee={event.fee} />
            <Badge variant="info">
              {participationLabel(
                event.participation,
                event.teamMin,
                event.teamMax,
              )}
            </Badge>
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground mt-4">
          <CalendarDays className="size-4" />
          {date ? (
            <>
              <span>{formatRange(date.startDate, date.endDate)}</span>
              <Badge variant={DATE_STATUS_META[date.status].variant}>
                {DATE_STATUS_META[date.status].label}
              </Badge>
            </>
          ) : (
            <span>Dates not set</span>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
