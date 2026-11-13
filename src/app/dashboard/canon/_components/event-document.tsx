"use client";

import {
  ArrowLeft,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { SHORT_DESC_MAX } from "@/lib/canon/constants";
import type {
  CanonCategoryRow,
  CanonEventDetail,
  CanonPerson,
} from "@/utils/canonDbActions";
import { deleteEvent, saveEvent, setEventStatus } from "../actions";
import { DatesTable } from "./dates-table";
import { type Draft, toDraft, toPayload } from "./draft";
import { EventFlow } from "./event-flow";
import { EventFooter, type FooterInfo } from "./event-footer";
import { EventHeader } from "./event-header";
import { ghost } from "./ghost";
import { SpocList } from "./spoc-list";
import { VenueList } from "./venue-list";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * One Canon event page. Read view and editor share ONE layout: with `editing`
 * on, each section swaps its text for a borderless field in the same spot, so
 * editing feels like writing on the page rather than filling a form.
 */
export function EventDocument({
  event,
  version,
  categories,
  members,
  canEdit,
  canManage,
  footer,
  startEditing,
}: {
  event: CanonEventDetail;
  /** `updatedAt` ISO string — the optimistic-lock version this page loaded. */
  version: string;
  categories: CanonCategoryRow[];
  members: CanonPerson[];
  canEdit: boolean;
  canManage: boolean;
  footer: FooterInfo;
  startEditing: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();

  const view = useMemo(() => toDraft(event), [event]);
  const [draft, setDraft] = useState<Draft | null>(
    startEditing && canEdit ? toDraft(event) : null,
  );
  // The version the open editor is based on. A realtime refresh moves
  // `version` ahead of it when someone else saves mid-edit.
  const [editBase, setEditBase] = useState(version);

  const editing = draft !== null;
  const d = draft ?? view;
  const set = (patch: Partial<Draft>) =>
    setDraft((cur) => (cur ? { ...cur, ...patch } : cur));
  const staleWhileEditing = editing && editBase !== version;

  // Drop `?edit=1` once consumed so a reload doesn't reopen the editor.
  useEffect(() => {
    if (startEditing) router.replace(pathname, { scroll: false });
  }, [startEditing, router, pathname]);

  // Warn before leaving with unsaved edits.
  const dirty =
    editing && JSON.stringify(toPayload(d)) !== JSON.stringify(toPayload(view));
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const beginEdit = () => {
    setDraft(toDraft(event));
    setEditBase(version);
  };

  const save = () =>
    start(async () => {
      if (!draft) return;
      const res = await saveEvent(event.id, toPayload(draft), editBase);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      setDraft(null);
      toast.success("Saved");
      router.refresh();
    });

  const toggleStatus = () =>
    start(async () => {
      const next = event.status === "published" ? "draft" : "published";
      const res = await setEventStatus(event.id, next);
      if ("error" in res) toast.error(res.error);
      else {
        toast.success(next === "published" ? "Published" : "Moved to drafts");
        router.refresh();
      }
    });

  const remove = () =>
    start(async () => {
      const res = await deleteEvent(event.id);
      if ("error" in res) toast.error(res.error);
      else {
        toast.success("Event deleted");
        router.push("/dashboard/canon");
      }
    });

  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-8 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/dashboard/canon">
            <ArrowLeft className="size-4" />
            Canon
          </Link>
        </Button>
        {!editing && (
          <div className="flex items-center gap-2">
            {event.status === "draft" && <Badge variant="destructive">Draft</Badge>}
            {canEdit && (
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={toggleStatus}
              >
                {event.status === "published" ? (
                  <>
                    <EyeOff className="size-4" /> Unpublish
                  </>
                ) : (
                  <>
                    <Eye className="size-4" /> Publish
                  </>
                )}
              </Button>
            )}
            {canEdit && (
              <Button size="sm" onClick={beginEdit}>
                <Pencil className="size-4" /> Edit
              </Button>
            )}
            {canManage && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    size="icon"
                    aria-label="Delete event"
                    // className="hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete “{event.name}”?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently removes the event page, its dates,
                      venues, flow and history. It can&apos;t be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={remove}>
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        )}
      </div>

      {staleWhileEditing && (
        <Alert>
          <TriangleAlert className="size-4" />
          <AlertDescription>
            Someone else saved this event while you were editing. Saving now
            will be refused, so copy anything you need, cancel and edit again.
          </AlertDescription>
        </Alert>
      )}

      <EventHeader
        d={d}
        editing={editing}
        set={set}
        categories={categories}
        categoryName={event.categoryName}
      />

      <SpocList
        spocs={d.spocs}
        editable={editing && canManage}
        members={members}
        onChange={(spocs) => set({ spocs })}
      />

      <DatesTable d={d} editing={editing} set={set} />

      <Section title="Venues">
        <VenueList d={d} editing={editing} set={set} />
      </Section>

      <Section title="About">
        {editing ? (
          <Textarea
            aria-label="Short description"
            placeholder="What is this event, in a few lines?"
            maxLength={SHORT_DESC_MAX}
            value={d.shortDesc}
            onChange={(e) => set({ shortDesc: e.target.value })}
            className={ghost(
              "min-h-12 resize-none text-base leading-relaxed md:text-base",
            )}
          />
        ) : d.shortDesc ? (
          <p className="whitespace-pre-line text-base leading-relaxed">
            {d.shortDesc}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">No description yet.</p>
        )}
      </Section>

      <Section title="Event flow">
        <EventFlow d={d} editing={editing} set={set} />
      </Section>

      <EventFooter info={footer} />

      {editing && (
        <div className="sticky bottom-4 z-10 flex items-center justify-end gap-2 rounded-xl border bg-background/90 p-2 shadow-lg backdrop-blur">
          <span className="mr-auto pl-2 text-xs text-muted-foreground">
            {dirty ? "Unsaved changes" : "No changes yet"}
          </span>
          <Separator orientation="vertical" className="h-6" />
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => setDraft(null)}
          >
            Cancel
          </Button>
          <Button disabled={pending || !dirty} onClick={save}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Save
          </Button>
        </div>
      )}
    </article>
  );
}
