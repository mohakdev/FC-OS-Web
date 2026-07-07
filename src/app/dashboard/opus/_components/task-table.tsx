"use client";

import { CalendarClock, GitBranch } from "lucide-react";
import { useMemo, useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import {
  formatDueDate,
  initials,
  isOverdue,
  labelTextColor,
  priorityBars,
  statusFraction,
} from "@/lib/opus/format";
import { cn } from "@/lib/utils";
import { PriorityIcon } from "./priority-icon";
import { StatusIcon } from "./status-icon";
import type { BoardTask, DomainMeta } from "./types";

const PAGE = 25;

export function TaskTable({
  tasks,
  meta,
  onOpen,
}: {
  tasks: BoardTask[];
  meta: DomainMeta;
  onOpen: (id: string) => void;
}) {
  const [visible, setVisible] = useState(PAGE);

  // Reset the window when the underlying task set changes (realtime refresh, create).
  // Adjusting state during render is React's recommended pattern for "reset on prop
  // change" — no effect needed.
  const [prevTasks, setPrevTasks] = useState(tasks);
  if (prevTasks !== tasks) {
    setPrevTasks(tasks);
    setVisible(PAGE);
  }

  const statusById = useMemo(
    () => new Map(meta.statuses.map((s) => [s.id, s])),
    [meta.statuses],
  );
  const labelById = useMemo(
    () => new Map(meta.labels.map((l) => [l.id, l])),
    [meta.labels],
  );

  const shown = tasks.slice(0, visible);

  if (tasks.length === 0) {
    return (
      <p className="px-1 py-8 text-center text-sm text-muted-foreground">
        No tasks
      </p>
    );
  }

  return (
    <div className="min-w-0">
      <Table>
        <TableBody>
          {shown.map((t) => {
            const status = statusById.get(t.statusId);
            const pBars = priorityBars(meta.priorities, t.priorityId);
            const priorityName = t.priorityId
              ? (meta.priorities.find((p) => p.id === t.priorityId)?.name ??
                "No priority")
              : "No priority";
            const taskLabels = t.labelIds
              .map((id) => labelById.get(id))
              .filter((l): l is NonNullable<typeof l> => Boolean(l));
            const overdue = isOverdue(t.dueDate, status?.name);

            return (
              <TableRow
                key={t.id}
                onClick={() => onOpen(t.id)}
                className="cursor-pointer [&>td]:px-3 [&>td]:py-3.5"
              >
                {/* Urgency */}
                <TableCell className="w-4 pr-1">
                  <PriorityIcon
                    bars={pBars.bars}
                    filled={pBars.filled}
                    fixed={pBars.fixed}
                    label={priorityName}
                  />
                </TableCell>

                {/* Status */}
                <TableCell className="w-4 pr-1">
                  {status && (
                    <StatusIcon
                      color={status.color}
                      fraction={statusFraction(meta.statuses, t.statusId)}
                    />
                  )}
                </TableCell>

                {/* Title — takes the remaining width, pushes trailing cells right */}
                <TableCell className="w-full">
                  <span className="block max-w-0 truncate font-medium capitalize sm:max-w-none">
                    {t.title}
                  </span>
                </TableCell>

                {/* Subtask count */}
                <TableCell className="text-right text-xs text-muted-foreground">
                  {t.subtaskCount > 0 && (
                    <span className="inline-flex items-center gap-0.5 font-medium">
                      <GitBranch className="size-3.5" strokeWidth={2.5} />
                      {t.subtaskCount}
                    </span>
                  )}
                </TableCell>

                {/* Labels */}
                <TableCell>
                  {taskLabels.length > 0 && (
                    <div className="flex items-center justify-end gap-1">
                      {taskLabels.slice(0, 2).map((l) => (
                        <span
                          key={l.id}
                          className="rounded-full px-2 py-px text-xs font-medium"
                          style={{
                            backgroundColor: l.color,
                            color: labelTextColor(l.color),
                          }}
                        >
                          {l.name}
                        </span>
                      ))}
                      {taskLabels.length > 2 && (
                        <span className="text-[10px] text-muted-foreground">
                          +{taskLabels.length - 2}
                        </span>
                      )}
                    </div>
                  )}
                </TableCell>

                {/* Due date */}
                <TableCell className="text-right text-xs font-medium text-muted-foreground">
                  {t.dueDate && (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1",
                        overdue && "text-destructive",
                      )}
                    >
                      <CalendarClock className="size-3.5" strokeWidth={2.5} />
                      {formatDueDate(t.dueDate)}
                    </span>
                  )}
                </TableCell>

                {/* Assignees */}
                <TableCell>
                  {t.assignees.length > 0 && (
                    <div className="flex items-center justify-end -space-x-1.5">
                      {t.assignees.slice(0, 3).map((a) => (
                        <Avatar
                          key={a.id}
                          className="size-5 border border-background"
                        >
                          <AvatarFallback className="text-[9px]">
                            {initials(a.firstName, a.lastName)}
                          </AvatarFallback>
                        </Avatar>
                      ))}
                      {t.assignees.length > 3 && (
                        <span className="pl-2 text-[10px] text-muted-foreground">
                          +{t.assignees.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </TableCell>

                {/* Created date */}
                <TableCell className="text-right text-xs text-muted-foreground">
                  {formatDueDate(t.createdAt)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {tasks.length > visible && (
        <div className="flex items-center justify-center gap-3 pt-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setVisible((v) => v + PAGE)}
            className="font-medium"
          >
            Load More
          </Button>
          <span className="text-xs text-muted-foreground">
            Showing {shown.length} of {tasks.length}
          </span>
        </div>
      )}
    </div>
  );
}
