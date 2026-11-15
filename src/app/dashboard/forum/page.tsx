import { Plus } from "lucide-react";
import { redirect } from "next/navigation";
import { Refresher } from "@/components/realtime/refresher";
import { Button } from "@/components/ui/button";
import { getAccessContext } from "@/lib/auth/context";
import { canCreateAny, createOptions } from "@/lib/forum/permissions";
import { expectedDomains, listEvents } from "@/utils/forumDbActions";
import { EventList } from "./_components/event-list";
import { MeetingDialog } from "./_components/meeting-dialog";

export const dynamic = "force-dynamic";

export default async function ForumPage() {
  const ctx = await getAccessContext();
  if (!ctx) redirect("/login");

  const [events, myDomains] = await Promise.all([
    listEvents(),
    expectedDomains(ctx),
  ]);
  const options = createOptions(ctx);

  return (
    <div className="mt-6 flex flex-col gap-8">
      <Refresher scope="forum" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-7xl text-primary">Forum</h1>
          <p className="text-sm text-muted-foreground">
            Every meeting and event the club holds.
          </p>
        </div>
        {canCreateAny(options) && (
          <MeetingDialog mode="create" options={options}>
            <Button>
              <Plus className="size-4" />
              New meeting
            </Button>
          </MeetingDialog>
        )}
      </div>

      <EventList
        events={events.map((e) => ({
          id: e.id,
          kind: e.kind,
          domain: e.domain,
          title: e.title,
          venue: e.venue,
          startsAt: e.startsAt,
          endsAt: e.endsAt,
          status: e.status,
        }))}
        myDomains={myDomains}
      />
    </div>
  );
}
