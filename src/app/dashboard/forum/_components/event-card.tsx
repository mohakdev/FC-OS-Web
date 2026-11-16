import { CalendarDays, MapPin } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { EventStatus, MeetingKind } from "@/lib/forum/constants";
import { formatWhen, kindLabel } from "@/lib/forum/format";
import { cn } from "@/lib/utils";

export type EventCardData = {
  id: string;
  kind: MeetingKind;
  domain: string | null;
  title: string;
  venue: string | null;
  startsAt: Date;
  endsAt: Date | null;
  status: EventStatus;
};

export function EventCard({ event }: { event: EventCardData }) {
  const cancelled = event.status === "cancelled";
  return (
    <Link
      href={`/dashboard/forum/${event.id}`}
      className="rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Card
        className={cn(
          "h-full transition-colors hover:bg-accent/40",
          cancelled && "opacity-60",
        )}
      >
        <CardHeader>
          <CardTitle
            className={cn("font-serif text-3xl", cancelled && "line-through")}
          >
            {event.title}
          </CardTitle>
          <CardDescription className="mt-1 flex flex-wrap gap-1">
            <Badge variant={event.kind === "club_meeting" ? "default" : "info"}>
              {kindLabel(event.kind, event.domain)}
            </Badge>
            {cancelled && <Badge variant="destructive">Cancelled</Badge>}
          </CardDescription>
        </CardHeader>
        <CardContent className="mt-4 flex flex-col gap-1.5 text-sm text-muted-foreground">
          <span className="flex items-center gap-2">
            <CalendarDays className="size-4 shrink-0" />
            {formatWhen(event.startsAt, event.endsAt)}
          </span>
          {event.venue && (
            <span className="flex items-center gap-2">
              <MapPin className="size-4 shrink-0" />
              <span className="truncate">{event.venue}</span>
            </span>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
