"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  FormValues,
  PendingSubtask,
} from "@/app/dashboard/opus/_components/types";

/**
 * A work-in-progress parent task the user chose to keep, held only in this browser.
 * `subtasks` are the ones staged in the create dialog but never sent to the server.
 */
export type TaskDraft = {
  id: string;
  savedAt: number;
  title: string;
  values: FormValues;
  subtasks: PendingSubtask[];
};

/** `values.dueDate` is a `Date`; JSON round-trips it to a string, so it needs reviving. */
type StoredDraft = Omit<TaskDraft, "values"> & {
  values: Omit<FormValues, "dueDate"> & { dueDate: string | null };
};

/**
 * Drafts are keyed per domain: a draft's status/priority/assignee/label ids only resolve
 * against the board it was written on, so it must never surface on another one.
 */
const keyFor = (domain: string) => `opus-drafts-${domain}`;

function parse(raw: string | null): TaskDraft[] {
  if (!raw) return [];
  try {
    const stored: StoredDraft[] = JSON.parse(raw);
    if (!Array.isArray(stored)) return [];
    return stored.map((d) => ({
      ...d,
      values: {
        ...d.values,
        dueDate: d.values.dueDate ? new Date(d.values.dueDate) : null,
      },
    }));
  } catch {
    return []; // corrupt or hand-edited storage — start clean rather than crash the board
  }
}

/**
 * Per-browser drafts for a domain's "New task" dialog, persisted in `localStorage`.
 * Starts empty (SSR-safe) and hydrates on mount, mirroring `usePersistedView`.
 */
export function useTaskDrafts(domain: string) {
  const [drafts, setDrafts] = useState<TaskDraft[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setDrafts(parse(window.localStorage.getItem(keyFor(domain))));
  }, [domain]);

  // Written straight through rather than in a `useEffect` on `drafts`: an effect would
  // fire once with the pre-hydration `[]` and clobber the stored drafts.
  const persist = useCallback(
    (next: TaskDraft[]) => {
      setDrafts(next);
      if (typeof window === "undefined") return;
      window.localStorage.setItem(keyFor(domain), JSON.stringify(next));
    },
    [domain],
  );

  /** Upsert by id — re-saving a draft that was loaded back in overwrites it in place. */
  const saveDraft = useCallback(
    (draft: TaskDraft) =>
      persist([draft, ...drafts.filter((d) => d.id !== draft.id)]),
    [drafts, persist],
  );

  const removeDraft = useCallback(
    (id: string) => persist(drafts.filter((d) => d.id !== id)),
    [drafts, persist],
  );

  return { drafts, saveDraft, removeDraft };
}

const UNITS: [limit: number, div: number, unit: Intl.RelativeTimeFormatUnit][] =
  [
    [60_000, 1000, "second"],
    [3_600_000, 60_000, "minute"],
    [86_400_000, 3_600_000, "hour"],
    [604_800_000, 86_400_000, "day"],
    [2_592_000_000, 604_800_000, "week"],
    [31_536_000_000, 2_592_000_000, "month"],
    [Number.POSITIVE_INFINITY, 31_536_000_000, "year"],
  ];

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

/** "2 hours ago" — for labelling a draft in the list. */
export function relativeTime(ts: number, now = Date.now()): string {
  const diff = ts - now;
  const abs = Math.abs(diff);
  const [, div, unit] = UNITS.find(([limit]) => abs < limit) ?? UNITS[0];
  return rtf.format(Math.round(diff / div), unit);
}
