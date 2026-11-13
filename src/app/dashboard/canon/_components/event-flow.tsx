"use client";

import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace";
import { type Draft, move, newPhase } from "./draft";
import { ghost } from "./ghost";
import { Markdown } from "./markdown";

function PhaseNumber({ n }: { n: number }) {
  return (
    <TraceIcon className="size-5 rounded-full bg-primary/10 text-[11px] font-semibold text-primary tabular-nums">
      {n}
    </TraceIcon>
  );
}

/** Event flow: one Trace line per phase, its body in a Card. */
export function EventFlow({
  d,
  editing,
  set,
}: {
  d: Draft;
  editing: boolean;
  set: (patch: Partial<Draft>) => void;
}) {
  const phases = d.phases;
  const update = (i: number, patch: Partial<(typeof phases)[number]>) =>
    set({ phases: phases.map((p, j) => (j === i ? { ...p, ...patch } : p)) });

  if (!editing) {
    if (phases.length === 0) {
      return (
        <p className="text-sm text-muted-foreground">
          Event flow not added yet.
        </p>
      );
    }
    return (
      <Trace className="gap-3">
        {phases.map((p, i) => (
          <TraceCollapsible key={p.key} defaultOpen>
            <TraceCollapsibleTrigger>
              <TraceLine className="text-base text-foreground">
                <PhaseNumber n={i + 1} />
                <TraceTitle className="font-medium">{p.title}</TraceTitle>
              </TraceLine>
            </TraceCollapsibleTrigger>
            <TraceCollapsibleContent>
              {p.body.trim() ? (
                <Card size="sm" className="shadow-sm">
                  <CardContent>
                    <Markdown>{p.body}</Markdown>
                  </CardContent>
                </Card>
              ) : (
                <p className="text-sm text-muted-foreground">No details yet.</p>
              )}
            </TraceCollapsibleContent>
          </TraceCollapsible>
        ))}
      </Trace>
    );
  }

  // Editing: same Trace rhythm, always expanded, title + body as ghost fields.
  return (
    <Trace className="gap-4">
      {phases.map((p, i) => (
        <div key={p.key} className="group flex flex-col gap-2">
          <TraceLine className="w-full text-base text-foreground">
            <PhaseNumber n={i + 1} />
            <Input
              aria-label={`Phase ${i + 1} title`}
              placeholder="Phase title"
              value={p.title}
              onChange={(e) => update(i, { title: e.target.value })}
              className={ghost("flex-1 text-base font-medium md:text-base")}
            />
            <span className="flex items-center opacity-60 group-hover:opacity-100">
              <Button
                size="icon"
                variant="ghost"
                className="size-6"
                aria-label="Move phase up"
                disabled={i === 0}
                onClick={() => set({ phases: move(phases, i, -1) })}
              >
                <ArrowUp className="size-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-6"
                aria-label="Move phase down"
                disabled={i === phases.length - 1}
                onClick={() => set({ phases: move(phases, i, 1) })}
              >
                <ArrowDown className="size-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-6"
                aria-label="Remove phase"
                onClick={() =>
                  set({ phases: phases.filter((_, j) => j !== i) })
                }
              >
                <X className="size-3.5" />
              </Button>
            </span>
          </TraceLine>
          <div className="ml-[calc(--spacing(2)-1px)] border-l pl-4">
            <Card size="sm" className="shadow-sm">
              <CardContent>
                <Textarea
                  aria-label={`Phase ${i + 1} details`}
                  placeholder="How this phase works. Markdown works: **bold**, - lists, [links](https://…)"
                  value={p.body}
                  onChange={(e) => update(i, { body: e.target.value })}
                  className={ghost("min-h-16 resize-none text-sm md:text-sm")}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      ))}
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 w-fit text-muted-foreground"
        onClick={() => set({ phases: [...phases, newPhase()] })}
      >
        <Plus className="size-4" />
        Add phase
      </Button>
    </Trace>
  );
}
