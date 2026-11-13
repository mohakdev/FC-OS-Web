import { redirect } from "next/navigation";
import { Refresher } from "@/components/realtime/refresher";
import { getAccessContext } from "@/lib/auth/context";
import { groupEvents, todayIST } from "@/lib/canon/format";
import { canManageCanon, canSeeEvent } from "@/lib/canon/permissions";
import { listCanonCategories, listCanonEvents } from "@/utils/canonDbActions";
import { CategoriesDialog } from "./_components/categories-dialog";
import { EventCard } from "./_components/event-card";
import { NewEventButton } from "./_components/new-event-button";

export const dynamic = "force-dynamic";

const GROUPS = [
  { key: "ongoing", label: "Ongoing" },
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
] as const;

export default async function CanonIndexPage() {
  const ctx = await getAccessContext();
  if (!ctx) redirect("/login");

  const [events, categories] = await Promise.all([
    listCanonEvents(),
    listCanonCategories(),
  ]);
  const visible = events.filter((e) => canSeeEvent(ctx, e));
  const groups = groupEvents(visible, todayIST());
  const canManage = canManageCanon(ctx);

  return (
    <div className="mt-6 flex flex-col gap-8">
      <Refresher scope="canon" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-7xl text-primary">Canon</h1>
          <p className="text-sm text-muted-foreground">
          The official single source of truth directory.
          </p>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <CategoriesDialog categories={categories} />
            <NewEventButton />
          </div>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          No events yet.
          {canManage && " Create the first one with New event."}
        </p>
      ) : (
        GROUPS.map(({ key, label }) =>
          groups[key].length ? (
            <section key={key} className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-muted-foreground">
                {label}{" "}
                <span className="tabular-nums">({groups[key].length})</span>
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {groups[key].map((e) => (
                  <EventCard key={e.id} event={e} />
                ))}
              </div>
            </section>
          ) : null,
        )
      )}
    </div>
  );
}
