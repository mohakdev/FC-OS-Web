import { ArrowLeft, CalendarDays, MapPin, Users } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { ProfileAvatar } from "@/components/profile-avatar";
import { Refresher } from "@/components/realtime/refresher";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAccessContext } from "@/lib/auth/context";
import { ago, formatStamp } from "@/lib/canon/format";
import { formatWhen, kindLabel } from "@/lib/forum/format";
import { canManageEvent } from "@/lib/forum/permissions";
import {
  getEvent,
  getEventAudience,
  getInviteLog,
} from "@/utils/forumDbActions";
import { EventActions } from "../_components/event-actions";

export const dynamic = "force-dynamic";

export default async function ForumEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const ctx = await getAccessContext();
  if (!ctx) redirect("/login");

  const event = await getEvent(id);
  if (!event) notFound();

  const canManage = canManageEvent(ctx, event);
  const [audience, log] = await Promise.all([
    getEventAudience(event),
    canManage ? getInviteLog(id) : Promise.resolve([]),
  ]);

  const invitedAt = new Map(
    log.filter((r) => r.kind === "invite").map((r) => [r.profileId, r.sentAt]),
  );
  const uninvited = audience.filter((m) => !invitedAt.has(m.id)).length;

  const now = new Date();
  const scheduled = event.status === "scheduled";
  const upcoming = event.startsAt.getTime() > now.getTime();
  const youreExpected = audience.some((m) => m.id === ctx.userId);

  return (
    <div className="mx-auto mt-6 flex w-full max-w-3xl flex-col gap-8">
      <Refresher scope="forum" />
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/dashboard/forum">
            <ArrowLeft className="size-4" />
            Forum
          </Link>
        </Button>
      </div>

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h1
            className={`font-serif text-5xl text-primary ${scheduled ? "" : "line-through opacity-60"}`}
          >
            {event.title}
          </h1>
          {canManage && (
            <EventActions
              event={{
                id: event.id,
                kind: event.kind,
                domain: event.domain,
                title: event.title,
                description: event.description,
                venue: event.venue,
                startsAt: event.startsAt,
                endsAt: event.endsAt,
              }}
              scheduled={scheduled}
              upcoming={upcoming}
              uninvited={uninvited}
            />
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          <Badge variant={event.kind === "club_meeting" ? "default" : "info"}>
            {kindLabel(event.kind, event.domain)}
          </Badge>
          {!scheduled && <Badge variant="destructive">Cancelled</Badge>}
          {scheduled && !upcoming && <Badge variant="secondary">Past</Badge>}
          {youreExpected && scheduled && (
            <Badge variant="success">You're invited</Badge>
          )}
        </div>
      </header>

      <section className="flex flex-col gap-2 text-sm">
        <span className="flex items-center gap-2">
          <CalendarDays className="size-4 text-muted-foreground" />
          {formatWhen(event.startsAt, event.endsAt)} (IST)
        </span>
        {event.venue && (
          <span className="flex items-center gap-2">
            <MapPin className="size-4 text-muted-foreground" />
            {event.venue}
          </span>
        )}
        <span className="flex items-center gap-2">
          <Users className="size-4 text-muted-foreground" />
          {audience.length} expected
        </span>
      </section>

      {event.description && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Agenda
          </h2>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {event.description}
          </p>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Audience <span className="tabular-nums">({audience.length})</span>
        </h2>
        {audience.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            No one is in this audience yet.
          </p>
        ) : (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  {canManage && <TableHead className="w-40">Invite</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {audience.map((m) => {
                  const sent = invitedAt.get(m.id);
                  return (
                    <TableRow key={m.id}>
                      <TableCell>
                        <span className="flex items-center gap-2">
                          <ProfileAvatar
                            userId={m.id}
                            firstName={m.firstName}
                            lastName={m.lastName}
                            avatarVersion={m.avatarVersion}
                            className="size-7"
                            fallbackClassName="text-xs"
                          />
                          {m.firstName} {m.lastName}
                        </span>
                      </TableCell>
                      {canManage && (
                        <TableCell>
                          {sent ? (
                            <Badge variant="success" title={formatStamp(sent)}>
                              Sent {ago(sent, now)}
                            </Badge>
                          ) : (
                            <Badge variant="outline">Not sent</Badge>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <footer className="text-xs text-muted-foreground">
        Created {formatStamp(event.createdAt)}
        {event.createdBy &&
          ` by ${event.createdBy.firstName} ${event.createdBy.lastName}`}
        {event.updatedAt.getTime() - event.createdAt.getTime() > 1000 &&
          ` · updated ${ago(event.updatedAt, now)}${
            event.updatedBy
              ? ` by ${event.updatedBy.firstName} ${event.updatedBy.lastName}`
              : ""
          }`}
      </footer>
    </div>
  );
}
