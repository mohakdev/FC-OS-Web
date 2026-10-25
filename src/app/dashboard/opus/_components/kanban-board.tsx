"use client";

import {
  closestCorners,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDown,
  FileText,
  LayoutGrid,
  Plus,
  Rows3,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useRealtimeEvent } from "@/components/realtime/realtime-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  type DomainId,
  domainIcons,
  formatDomain,
  statusFraction,
} from "@/lib/opus/format";
import { usePersistedView } from "@/lib/opus/use-persisted-view";
import { relativeTime, useTaskDrafts } from "@/lib/opus/use-task-drafts";
import { cn } from "@/lib/utils";
import {
  addSubtaskAction,
  createTaskAction,
  moveTaskAction,
  type TaskInputDTO,
} from "../actions";
import { StatusIcon } from "./status-icon";
import { TaskCard } from "./task-card";
import { TaskDetailDialog } from "./task-detail-dialog";
import { TaskFieldsDialog } from "./task-fields-dialog";
import { TaskTable } from "./task-table";
import type {
  BoardTask,
  DomainMeta,
  FormValues,
  PendingSubtask,
} from "./types";

type Columns = Record<string, string[]>;

// Radix ScrollArea wraps its content in `display: table`, which swallows `h-full`.
// Forcing the wrapper back to a full-height block lets columns fill the board and
// scroll on their own.
const fillViewport =
  "[&>[data-slot=scroll-area-viewport]>div]:block! [&>[data-slot=scroll-area-viewport]>div]:h-full";

function buildColumns(statusIds: string[], tasks: BoardTask[]): Columns {
  const cols: Columns = {};
  for (const id of statusIds) cols[id] = [];
  for (const t of tasks) {
    if (!cols[t.statusId]) cols[t.statusId] = [];
    cols[t.statusId].push(t.id);
  }
  return cols;
}

function SortableCard({
  task,
  meta,
  statusName,
  onOpen,
}: {
  task: BoardTask;
  meta: DomainMeta;
  statusName: string;
  onOpen: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={isDragging ? "opacity-40" : undefined}
      {...attributes}
      {...listeners}
    >
      <TaskCard
        task={task}
        priorities={meta.priorities}
        labels={meta.labels}
        statusName={statusName}
        onOpen={onOpen}
      />
    </div>
  );
}

function Column({
  statusId,
  name,
  color,
  fraction,
  taskIds,
  taskMap,
  meta,
  onOpen,
}: {
  statusId: string;
  name: string;
  color: string;
  fraction: number;
  taskIds: string[];
  taskMap: Map<string, BoardTask>;
  meta: DomainMeta;
  onOpen: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: statusId });
  return (
    <div className="flex h-full min-h-0 w-80 shrink-0 flex-col">
      <div className="mb-2 flex shrink-0 items-center gap-2 px-1">
        <StatusIcon color={color} fraction={fraction} />
        <span className="text-sm font-semibold">{name}</span>
        <span className="rounded-full bg-muted px-1.5 text-xs text-muted-foreground">
          {taskIds.length}
        </span>
      </div>
      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        {/* The drop target spans the full column height; cards scroll inside it. */}
        <div
          ref={setNodeRef}
          className={`flex min-h-24 flex-1 flex-col rounded-lg border border-dashed transition-colors ${
            isOver ? "border-primary/50 bg-accent/40" : "border-transparent"
          }`}
        >
          <ScrollArea className={cn("min-h-0 flex-1", fillViewport)}>
            <div className="flex flex-col gap-2 p-2">
              {taskIds.map((id) => {
                const task = taskMap.get(id);
                if (!task) return null;
                return (
                  <SortableCard
                    key={id}
                    task={task}
                    meta={meta}
                    statusName={name}
                    onOpen={() => onOpen(id)}
                  />
                );
              })}
              {taskIds.length === 0 && (
                <p className="px-1 py-4 text-center text-xs text-muted-foreground">
                  No tasks
                </p>
              )}
            </div>
          </ScrollArea>
        </div>
      </SortableContext>
    </div>
  );
}

export function KanbanBoard({
  domain,
  meta,
  tasks,
  canManage,
  currentUserId,
  initialTaskId,
}: {
  domain: string;
  meta: DomainMeta;
  tasks: BoardTask[];
  canManage: boolean;
  currentUserId: string;
  initialTaskId?: string;
}) {
  const router = useRouter();

  // Live updates: refresh when another session mutates this domain's board.
  // The re-sync effect below flows the new props into local state.
  useRealtimeEvent(
    (evt) => evt.scope === "opus-board" && evt.domain === domain,
    () => router.refresh(),
  );

  const statusIds = useMemo(
    () => meta.statuses.map((s) => s.id),
    [meta.statuses],
  );
  const statusName = useMemo(
    () => new Map(meta.statuses.map((s) => [s.id, s.name])),
    [meta.statuses],
  );

  const [columns, setColumns] = useState<Columns>(() =>
    buildColumns(statusIds, tasks),
  );
  const [taskMap, setTaskMap] = useState<Map<string, BoardTask>>(
    () => new Map(tasks.map((t) => [t.id, t])),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [openTaskId, setOpenTaskId] = useState<string | null>(
    initialTaskId ?? null,
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [view, setView] = usePersistedView();

  const { drafts, saveDraft, removeDraft } = useTaskDrafts(domain);
  // Which draft (if any) the open create dialog came from — decides whether "Save to
  // drafts" overwrites or adds, and which draft a successful create clears.
  const [loadedDraftId, setLoadedDraftId] = useState<string | null>(null);
  const [draftSeed, setDraftSeed] = useState<{
    values: FormValues;
    subtasks: PendingSubtask[];
  } | null>(null);

  function openBlankTask() {
    setDraftSeed(null);
    setLoadedDraftId(null);
    setCreateOpen(true);
  }

  function openDraft(id: string) {
    const draft = drafts.find((d) => d.id === id);
    if (!draft) return;
    setDraftSeed({ values: draft.values, subtasks: draft.subtasks });
    setLoadedDraftId(draft.id);
    setCreateOpen(true);
  }

  // Flat, status-ordered task list for the table view — mirrors the board's ordering
  // (statuses in order, tasks in each column's order) so both views agree.
  const orderedTasks = useMemo(() => {
    const out: BoardTask[] = [];
    for (const s of meta.statuses) {
      for (const id of columns[s.id] ?? []) {
        const t = taskMap.get(id);
        if (t) out.push(t);
      }
    }
    return out;
  }, [meta.statuses, columns, taskMap]);

  // Re-sync from the server whenever the board data changes.
  useEffect(() => {
    setColumns(buildColumns(statusIds, tasks));
    setTaskMap(new Map(tasks.map((t) => [t.id, t])));
  }, [statusIds, tasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const findContainer = (id: string): string | undefined => {
    if (id in columns) return id;
    return Object.keys(columns).find((key) => columns[key].includes(id));
  };

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function handleDragOver(e: DragOverEvent) {
    const activeIdStr = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    if (!overId) return;
    const from = findContainer(activeIdStr);
    const to = findContainer(overId);
    if (!from || !to || from === to) return;

    setColumns((prev) => {
      const fromItems = prev[from].filter((i) => i !== activeIdStr);
      const toItems = [...prev[to]];
      const overIndex = toItems.indexOf(overId);
      const insertAt = overIndex >= 0 ? overIndex : toItems.length;
      toItems.splice(insertAt, 0, activeIdStr);
      return { ...prev, [from]: fromItems, [to]: toItems };
    });
  }

  function handleDragEnd(e: DragEndEvent) {
    const activeIdStr = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    setActiveId(null);
    if (!overId) return;

    const to = findContainer(overId);
    if (!to) return;

    let nextOrder = columns[to];
    const overIndex = nextOrder.indexOf(overId);
    const activeIndex = nextOrder.indexOf(activeIdStr);
    if (overIndex >= 0 && activeIndex >= 0 && overIndex !== activeIndex) {
      const reordered = [...nextOrder];
      reordered.splice(activeIndex, 1);
      reordered.splice(overIndex, 0, activeIdStr);
      nextOrder = reordered;
      setColumns((prev) => ({ ...prev, [to]: reordered }));
    }

    moveTaskAction(activeIdStr, {
      toStatusId: to,
      targetOrder: nextOrder,
    }).then((res) => {
      if ("error" in res) {
        toast.error(res.error);
        router.refresh();
      }
    });
  }

  const activeTask = activeId ? taskMap.get(activeId) : null;
  const DomainIcon = domainIcons[domain as DomainId];

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-hidden">
      <div className="flex shrink-0 items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg border bg-card text-primary">
            <DomainIcon className="size-5" />
          </span>
          <div>
            <h1 className="font-serif text-3xl text-primary">
              {formatDomain(domain)}
            </h1>
            <p className="text-sm text-muted-foreground font-medium">
              {tasks.length} task{tasks.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="font-medium">
                {view === "board" ? (
                  <LayoutGrid className="size-4" />
                ) : (
                  <Rows3 className="size-4" />
                )}
                {view === "board" ? "Board" : "Table"}
                <ChevronDown className="size-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36">
              <DropdownMenuRadioGroup
                value={view}
                onValueChange={(v) => setView(v as "board" | "table")}
              >
                <DropdownMenuRadioItem value="board">
                  <LayoutGrid className="size-4" /> Board
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="table">
                  <Rows3 className="size-4" /> Table
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          {canManage && drafts.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="font-medium">
                  <FileText className="size-4" />
                  Drafts
                  <span className="text-muted-foreground">{drafts.length}</span>
                  <ChevronDown className="size-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                {drafts.map((d) => (
                  <DropdownMenuItem
                    key={d.id}
                    onSelect={() => openDraft(d.id)}
                    className="flex items-center gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium capitalize">
                        {d.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {relativeTime(d.savedAt)}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0 text-muted-foreground"
                      aria-label={`Delete draft ${d.title}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        removeDraft(d.id);
                        toast.success("Draft deleted.");
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {canManage && (
            <Button onClick={openBlankTask} className="font-medium">
              <Plus className="size-4" /> New task
            </Button>
          )}
        </div>
      </div>

      {view === "board" ? (
        <ScrollArea className={cn("min-h-0 min-w-0 flex-1", fillViewport)}>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <div className="flex h-full w-max gap-2 pb-3">
              {meta.statuses.map((s) => (
                <Column
                  key={s.id}
                  statusId={s.id}
                  name={s.name}
                  color={s.color}
                  fraction={statusFraction(meta.statuses, s.id)}
                  taskIds={columns[s.id] ?? []}
                  taskMap={taskMap}
                  meta={meta}
                  onOpen={setOpenTaskId}
                />
              ))}
            </div>
            <DragOverlay>
              {activeTask ? (
                <TaskCard
                  task={activeTask}
                  priorities={meta.priorities}
                  labels={meta.labels}
                  statusName={statusName.get(activeTask.statusId) ?? ""}
                  onOpen={() => {}}
                />
              ) : null}
            </DragOverlay>
          </DndContext>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      ) : (
        <ScrollArea className="min-h-0 min-w-0 flex-1">
          <TaskTable tasks={orderedTasks} meta={meta} onOpen={setOpenTaskId} />
        </ScrollArea>
      )}

      <TaskDetailDialog
        taskId={openTaskId}
        meta={meta}
        currentUserId={currentUserId}
        canManage={canManage}
        onClose={() => setOpenTaskId(null)}
        onChanged={() => router.refresh()}
      />

      {canManage && createOpen && (
        <TaskFieldsDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          heading={loadedDraftId ? "Draft" : "New task"}
          description={`${formatDomain(domain)}`}
          submitLabel="Create task"
          meta={meta}
          showDueDate
          showSubtasks
          initial={draftSeed?.values}
          initialSubtasks={draftSeed?.subtasks}
          onSaveDraft={(values, subtasks) => {
            saveDraft({
              id: loadedDraftId ?? crypto.randomUUID(),
              savedAt: Date.now(),
              title: values.title.trim() || "Untitled draft",
              values,
              subtasks,
            });
            toast.success("Draft saved.");
          }}
          onDiscardDraft={
            loadedDraftId
              ? () => {
                  removeDraft(loadedDraftId);
                  toast.success("Draft discarded.");
                }
              : undefined
          }
          onSubmit={async (input: TaskInputDTO, subtasks: TaskInputDTO[]) => {
            const res = await createTaskAction(domain, input);
            if ("error" in res) return res;
            for (const sub of subtasks) {
              await addSubtaskAction(res.id, sub);
            }
            // The draft became a real task — it has no reason to linger.
            if (loadedDraftId) removeDraft(loadedDraftId);
            toast.success("Task created.");
            router.refresh();
            return { ok: true } as const;
          }}
        />
      )}
    </div>
  );
}
