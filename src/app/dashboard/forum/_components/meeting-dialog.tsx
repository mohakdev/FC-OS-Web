"use client";

import { CalendarIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  DESCRIPTION_MAX,
  type MeetingKind,
  TITLE_MAX,
  VENUE_MAX,
} from "@/lib/forum/constants";
import {
  formatDate,
  istToDate,
  toISTDate,
  toISTTime,
} from "@/lib/forum/format";
import type { CreateOptions } from "@/lib/forum/permissions";
import type { MeetingInput } from "@/lib/forum/schema";
import { type DomainId, formatDomain } from "@/lib/opus/format";
import { cn } from "@/lib/utils";
import { createMeetingAction, updateMeetingAction } from "../actions";

/**
 * One select value per (kind, domain) the dialog can create:
 *   "club"            → full-team meeting
 *   "<domain>"        → that domain's meeting
 *   "assoc"           → associate leads of every domain
 *   "assoc:<domain>"  → that domain's associate leads
 */
type Audience = "club" | "assoc" | DomainId | `assoc:${DomainId}`;

const toAudience = (kind: MeetingKind, domain: DomainId | null): Audience => {
  switch (kind) {
    case "club_meeting":
      return "club";
    case "assoc_leads_meeting":
      return domain ? `assoc:${domain}` : "assoc";
    case "domain_meeting":
      return domain as DomainId;
  }
};

const fromAudience = (
  a: Audience,
): { kind: MeetingKind; domain: DomainId | null } => {
  if (a === "club") return { kind: "club_meeting", domain: null };
  if (a === "assoc") return { kind: "assoc_leads_meeting", domain: null };
  if (a.startsWith("assoc:")) {
    return {
      kind: "assoc_leads_meeting",
      domain: a.slice("assoc:".length) as DomainId,
    };
  }
  return { kind: "domain_meeting", domain: a as DomainId };
};

const audienceLabel = (a: Audience): string => {
  const { kind, domain } = fromAudience(a);
  switch (kind) {
    case "club_meeting":
      return "Full team (every member)";
    case "assoc_leads_meeting":
      return domain
        ? `${formatDomain(domain)} associate leads`
        : "Associate leads (all domains)";
    case "domain_meeting":
      return `${formatDomain(domain as DomainId)} domain`;
  }
};

export type EditableMeeting = {
  id: string;
  kind: MeetingKind;
  domain: DomainId | null;
  title: string;
  description: string;
  venue: string | null;
  startsAt: Date;
  endsAt: Date | null;
};

type Props =
  | { mode: "create"; options: CreateOptions; children: ReactNode }
  | { mode: "edit"; event: EditableMeeting; children: ReactNode };

/** A calendar `Date` (local midnight) → its `YYYY-MM-DD` day. */
const dayOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** `YYYY-MM-DD` → a local-midnight `Date` for the calendar. */
const dateOfDay = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
};

function initialState(props: Props) {
  if (props.mode === "edit") {
    const e = props.event;
    return {
      audience: toAudience(e.kind, e.domain),
      title: e.title,
      description: e.description,
      venue: e.venue ?? "",
      date: toISTDate(e.startsAt),
      startTime: toISTTime(e.startsAt),
      endTime: e.endsAt ? toISTTime(e.endsAt) : "",
      notify: true,
    };
  }
  const first: Audience | "" =
    props.options.domains[0] ??
    (props.options.club
      ? "club"
      : props.options.assocAll
        ? "assoc"
        : props.options.assocDomains[0]
          ? (`assoc:${props.options.assocDomains[0]}` as const)
          : "");
  return {
    audience: first as Audience,
    title: "",
    description: "",
    venue: "",
    date: "",
    startTime: "17:00",
    endTime: "18:00",
    notify: true,
  };
}

export function MeetingDialog(props: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [form, setForm] = useState(() => initialState(props));
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const editing = props.mode === "edit";
  const todayIST = toISTDate(new Date());

  const onOpenChange = (next: boolean) => {
    // Reopening starts from the current props, not a stale half-edit.
    if (next) setForm(initialState(props));
    setOpen(next);
  };

  const submit = () =>
    start(async () => {
      const input: MeetingInput = {
        ...fromAudience(form.audience),
        title: form.title,
        description: form.description,
        venue: form.venue || null,
        date: form.date,
        startTime: form.startTime,
        endTime: form.endTime || null,
        notify: form.notify,
      };
      if (props.mode === "edit") {
        const res = await updateMeetingAction(props.event.id, input);
        if ("error" in res) {
          toast.error(res.error);
          return;
        }
        toast.success("Meeting updated.");
        setOpen(false);
        router.refresh();
        return;
      }
      const res = await createMeetingAction(input);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(
        form.notify ? "Meeting created. Sending invites…" : "Meeting created.",
      );
      setOpen(false);
      router.push(`/dashboard/forum/${res.id}`);
    });

  const audienceValues: Audience[] =
    props.mode === "create"
      ? [
          ...(props.options.club ? (["club"] as const) : []),
          ...props.options.domains,
          ...(props.options.assocAll ? (["assoc"] as const) : []),
          ...props.options.assocDomains.map((d) => `assoc:${d}` as const),
        ]
      : [form.audience];
  const audienceChoices = audienceValues.map((value) => ({
    value,
    label: audienceLabel(value),
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{props.children}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit meeting" : "New meeting"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Changing the time, venue or title can email everyone who was invited."
              : "The audience is worked out from who's in the club or domain right now. Leadership is invited to every domain and associate-leads meeting."}
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="forum-audience">Who's it for</Label>
            <Select
              value={form.audience}
              onValueChange={(v) => set("audience", v as Audience)}
              disabled={editing || pending}
            >
              <SelectTrigger id="forum-audience" className="w-full">
                <SelectValue placeholder="Pick an audience" />
              </SelectTrigger>
              <SelectContent>
                {audienceChoices.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="forum-title">Title</Label>
            <Input
              id="forum-title"
              value={form.title}
              maxLength={TITLE_MAX}
              placeholder="Weekly sync"
              onChange={(e) => set("title", e.target.value)}
              disabled={pending}
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto]">
            <div className="flex flex-col gap-2">
              <Label>Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pending}
                    className={cn(
                      "justify-start font-normal",
                      !form.date && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="size-4" />
                    {form.date
                      ? formatDate(istToDate(form.date, "12:00") ?? new Date())
                      : "Pick a day"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={form.date ? dateOfDay(form.date) : undefined}
                    onSelect={(d) => set("date", d ? dayOf(d) : "")}
                    disabled={(d) => dayOf(d) < todayIST}
                    autoFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="forum-start">Starts</Label>
              <Input
                id="forum-start"
                type="time"
                value={form.startTime}
                onChange={(e) => set("startTime", e.target.value)}
                disabled={pending}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="forum-end">Ends</Label>
              <Input
                id="forum-end"
                type="time"
                value={form.endTime}
                onChange={(e) => set("endTime", e.target.value)}
                disabled={pending}
              />
            </div>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            Times are in IST.
          </p>

          <div className="flex flex-col gap-2">
            <Label htmlFor="forum-venue">Venue</Label>
            <Input
              id="forum-venue"
              value={form.venue}
              maxLength={VENUE_MAX}
              placeholder="TP 401, or a meet link"
              onChange={(e) => set("venue", e.target.value)}
              disabled={pending}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="forum-description">Agenda</Label>
            <Textarea
              id="forum-description"
              value={form.description}
              maxLength={DESCRIPTION_MAX}
              rows={4}
              placeholder="What's this meeting about?"
              onChange={(e) => set("description", e.target.value)}
              disabled={pending}
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="forum-notify"
              checked={form.notify}
              onCheckedChange={(v) => set("notify", v === true)}
              disabled={pending}
            />
            <Label htmlFor="forum-notify" className="font-normal">
              {editing
                ? "Email invitees if the time, venue or title changes"
                : "Email invites to the audience"}
            </Label>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !form.audience}>
              {pending && <Spinner />}
              {editing ? "Save changes" : "Create meeting"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
