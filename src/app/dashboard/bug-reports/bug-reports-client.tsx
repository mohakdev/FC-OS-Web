"use client";

import {
  Bug,
  Check,
  Loader2,
  MoreHorizontal,
  RotateCcw,
  Trash2,
} from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { relativeTime } from "@/lib/opus/use-task-drafts";
import type { BugReportRow } from "@/utils/bugDbActions";
import {
  deleteBugAction,
  setBugStatusAction,
  submitBugAction,
} from "./actions";

type Filter = "all" | "open" | "fixed";

export default function BugReportsClient({
  bugs,
  canManage,
  currentUserId,
}: {
  bugs: BugReportRow[];
  canManage: boolean;
  currentUserId: string | null;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [pendingDelete, setPendingDelete] = useState<BugReportRow | null>(null);
  const [submitting, startSubmit] = useTransition();
  const [mutating, startMutate] = useTransition();

  const submit = () => {
    startSubmit(async () => {
      const res = await submitBugAction(title, description);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      setTitle("");
      setDescription("");
      toast.success("Bug reported. Thanks!");
    });
  };

  const setStatus = (id: string, status: "open" | "fixed") => {
    startMutate(async () => {
      const res = await setBugStatusAction(id, status);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(status === "fixed" ? "Marked fixed." : "Reopened.");
    });
  };

  const confirmDelete = () => {
    const bug = pendingDelete;
    if (!bug) return;
    startMutate(async () => {
      const res = await deleteBugAction(bug.id);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      setPendingDelete(null);
      toast.success("Report deleted.");
    });
  };

  const visible = bugs.filter((b) => filter === "all" || b.status === filter);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-3">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What's broken?"
            maxLength={120}
            disabled={submitting}
          />
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Steps to reproduce, what you expected, what happened instead (optional)"
            rows={3}
            maxLength={2000}
            disabled={submitting}
          />
          <div className="flex justify-end">
            <Button
              onClick={submit}
              disabled={submitting || title.trim().length < 4}
            >
              {submitting ? <Loader2 className="animate-spin" /> : <Bug />}
              Report bug
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="open">Open</TabsTrigger>
            <TabsTrigger value="fixed">Fixed</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="divide-y rounded-lg border">
          {visible.length === 0 ? (
            <p className="py-12 text-center text-muted-foreground text-sm">
              {bugs.length === 0
                ? "No bugs reported yet."
                : "Nothing here — try another filter."}
            </p>
          ) : (
            visible.map((bug) => (
              <BugRow
                key={bug.id}
                bug={bug}
                canManage={canManage}
                isMine={
                  bug.reporterId !== null && bug.reporterId === currentUserId
                }
                busy={mutating}
                onSetStatus={setStatus}
                onDelete={() => setPendingDelete(bug)}
              />
            ))
          )}
        </div>
      </div>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this report?</AlertDialogTitle>
            <AlertDialogDescription>
              “{pendingDelete?.title}” will be removed for everyone. This can't
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={mutating}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function BugRow({
  bug,
  canManage,
  isMine,
  busy,
  onSetStatus,
  onDelete,
}: {
  bug: BugReportRow;
  canManage: boolean;
  isMine: boolean;
  busy: boolean;
  onSetStatus: (id: string, status: "open" | "fixed") => void;
  onDelete: () => void;
}) {
  const fixed = bug.status === "fixed";
  const reporter = isMine
    ? "you"
    : bug.reporterFirstName
      ? `${bug.reporterFirstName} ${bug.reporterLastName ?? ""}`.trim()
      : "Unknown";

  return (
    <div className="flex items-start gap-3 p-4">
      <Badge variant={fixed ? "outline" : "secondary"} className="mt-0.5">
        {fixed ? "Fixed" : "Open"}
      </Badge>
      <div className="min-w-0 flex-1">
        <p
          className={
            fixed
              ? "font-medium text-muted-foreground line-through"
              : "font-medium"
          }
        >
          {bug.title}
        </p>
        {bug.description && (
          <p className="mt-1 whitespace-pre-wrap text-muted-foreground text-sm">
            {bug.description}
          </p>
        )}
        <p className="mt-1 text-muted-foreground text-xs">
          by {reporter} · {relativeTime(bug.createdAt.getTime())}
        </p>
      </div>
      {canManage && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" disabled={busy}>
              <MoreHorizontal />
              <span className="sr-only">Bug report actions</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => onSetStatus(bug.id, fixed ? "open" : "fixed")}
            >
              {fixed ? <RotateCcw /> : <Check />}
              {fixed ? "Reopen" : "Mark fixed"}
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
