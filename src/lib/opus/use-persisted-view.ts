"use client";

import { useEffect, useState } from "react";

export type OpusView = "board" | "table";

const KEY = "opus-tasks-view";

const isView = (v: string | null): v is OpusView =>
  v === "board" || v === "table";

/**
 * Per-user (per-browser) Opus tasks view preference, persisted in `localStorage`. The
 * choice is private to each user and not shared via the URL. Starts at the SSR-safe
 * default ("board") and hydrates from storage on mount to avoid a hydration mismatch.
 */
export function usePersistedView(): [OpusView, (v: OpusView) => void] {
  const [view, setView] = useState<OpusView>("board");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(KEY);
    if (isView(stored)) setView(stored);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(KEY, view);
  }, [view]);

  return [view, setView];
}
