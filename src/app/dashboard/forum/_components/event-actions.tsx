"use client";

import { Ban, MoreHorizontal, Pencil, Send, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import {
  cancelMeetingAction,
  deleteMeetingAction,
  sendInvitesAction,
} from "../actions";
import { type EditableMeeting, MeetingDialog } from "./meeting-dialog";

export function EventActions({
  event,
  scheduled,
  upcoming,
  uninvited,
}: {
  event: EditableMeeting;
  scheduled: boolean;
  upcoming: boolean;
  /** Audience members with no invite yet. */
  uninvited: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<"cancel" | "delete" | null>(null);
  const [notifyCancel, setNotifyCancel] = useState(true);

  const sendInvites = () =>
    start(async () => {
      const res = await sendInvitesAction(event.id);
      if ("error" in res) toast.error(res.error);
      else
        toast.success(
          `Sending ${uninvited} invite${uninvited === 1 ? "" : "s"}…`,
        );
    });

  const runConfirmed = () =>
    start(async () => {
      if (confirm === "cancel") {
        const res = await cancelMeetingAction(event.id, notifyCancel);
        if ("error" in res) {
          toast.error(res.error);
          return;
        }
        toast.success("Meeting cancelled.");
        setConfirm(null);
        router.refresh();
      } else if (confirm === "delete") {
        const res = await deleteMeetingAction(event.id);
        if ("error" in res) {
          toast.error(res.error);
          return;
        }
        toast.success("Meeting deleted.");
        router.push("/dashboard/forum");
      }
    });

  return (
    <div className="flex items-center gap-2">
      {scheduled && upcoming && uninvited > 0 && (
        <Button variant="outline" onClick={sendInvites} disabled={pending}>
          {pending ? <Spinner /> : <Send className="size-4" />}
          Send {uninvited} invite{uninvited === 1 ? "" : "s"}
        </Button>
      )}
      {scheduled && (
        <MeetingDialog mode="edit" event={event}>
          <Button variant="outline" disabled={pending}>
            <Pencil className="size-4" />
            Edit
          </Button>
        </MeetingDialog>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="More actions">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {scheduled && (
            <>
              <DropdownMenuItem onSelect={() => setConfirm("cancel")}>
                <Ban />
                Cancel meeting
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setConfirm("delete")}
          >
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "cancel"
                ? "Cancel this meeting?"
                : "Delete this meeting?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "cancel"
                ? `“${event.title}” stays in Forum, marked cancelled.`
                : `“${event.title}” will be removed for everyone. This can't be undone. Prefer cancelling a meeting that people were invited to.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirm === "cancel" && upcoming && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="forum-notify-cancel"
                checked={notifyCancel}
                onCheckedChange={(v) => setNotifyCancel(v === true)}
              />
              <Label htmlFor="forum-notify-cancel" className="font-normal">
                Email everyone who was invited
              </Label>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Back</AlertDialogCancel>
            <AlertDialogAction
              variant={confirm === "delete" ? "destructive" : "default"}
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                runConfirmed();
              }}
            >
              {pending && <Spinner />}
              {confirm === "cancel" ? "Cancel meeting" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
