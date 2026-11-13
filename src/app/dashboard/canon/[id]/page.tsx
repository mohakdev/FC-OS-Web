import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { Refresher } from "@/components/realtime/refresher";
import { getAccessContext } from "@/lib/auth/context";
import { ago, formatStamp } from "@/lib/canon/format";
import {
  canEditEvent,
  canManageCanon,
  canSeeEvent,
} from "@/lib/canon/permissions";
import {
  getCanonEvent,
  listCanonCategories,
  listCanonMemberOptions,
} from "@/utils/canonDbActions";
import { EventDocument } from "../_components/event-document";

export const dynamic = "force-dynamic";

export default async function CanonEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { edit } = await searchParams;

  const ctx = await getAccessContext();
  if (!ctx) redirect("/login");

  const event = await getCanonEvent(id);
  const spocIds = event?.spocs.map((s) => s.id) ?? [];
  // A hidden draft 404s rather than 403s, so its existence doesn't leak.
  if (!event || !canSeeEvent(ctx, { status: event.status, spocIds })) {
    notFound();
  }

  const canManage = canManageCanon(ctx);
  const canEdit = canEditEvent(ctx, spocIds);
  const [categories, members] = await Promise.all([
    canEdit ? listCanonCategories() : Promise.resolve([]),
    canManage ? listCanonMemberOptions() : Promise.resolve([]),
  ]);

  // Relative time is computed here, once, when the page is opened.
  const now = new Date();
  const footer = {
    createdAt: formatStamp(event.createdAt),
    updatedAt: formatStamp(event.updatedAt),
    updatedBy: event.updatedBy
      ? `${event.updatedBy.firstName} ${event.updatedBy.lastName}`
      : null,
    ago: ago(event.updatedAt, now),
  };

  return (
    <div className="mt-6">
      <Refresher scope="canon" />
      <EventDocument
        event={event}
        version={event.updatedAt.toISOString()}
        categories={categories}
        members={members}
        canEdit={canEdit}
        canManage={canManage}
        footer={footer}
        startEditing={edit === "1"}
      />
    </div>
  );
}
