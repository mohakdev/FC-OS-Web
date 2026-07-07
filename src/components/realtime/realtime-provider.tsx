"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import type { RealtimeEvent } from "@/lib/realtime/notify";

type Listener = {
  predicate: (evt: RealtimeEvent) => boolean;
  handler: () => void;
};

type RealtimeContextValue = {
  register: (listener: Listener) => () => void;
};

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

/**
 * Opens a SINGLE same-origin `EventSource("/api/realtime")` for the whole
 * dashboard and dispatches incoming signals to registered listeners.
 *
 * Same-origin relative URL means this works on localhost and behind the tunnel
 * with no env var. Handlers are coalesced so a burst of NOTIFYs (or a self-echo
 * of a mutation the current tab just made) triggers at most one refresh.
 */
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const listeners = useRef<Set<Listener>>(new Set());

  // Trailing-debounced dispatch: collect which handlers matched, fire once.
  const pending = useRef<Set<() => void>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    timer.current = null;
    const handlers = pending.current;
    pending.current = new Set();
    for (const h of handlers) h();
  }, []);

  const schedule = useCallback(
    (handler: () => void) => {
      pending.current.add(handler);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 250);
    },
    [flush],
  );

  const register = useCallback((listener: Listener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  useEffect(() => {
    const source = new EventSource("/api/realtime");

    source.onmessage = (e) => {
      let evt: RealtimeEvent;
      try {
        evt = JSON.parse(e.data) as RealtimeEvent;
      } catch {
        return;
      }
      for (const l of listeners.current) {
        if (l.predicate(evt)) schedule(l.handler);
      }
    };

    // Fires on initial connect AND after any auto-reconnect. Postgres
    // LISTEN/NOTIFY has no backlog, so anything missed while disconnected is
    // recovered by refreshing every registered listener once on (re)open.
    source.onopen = () => {
      for (const l of listeners.current) schedule(l.handler);
    };

    return () => {
      source.close();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [schedule]);

  const value = useMemo<RealtimeContextValue>(() => ({ register }), [register]);

  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  );
}

/**
 * Subscribe to realtime signals matching `predicate`. `handler` runs (debounced,
 * coalesced) whenever a matching event arrives or the stream (re)connects.
 * No-op outside a `RealtimeProvider`.
 */
export function useRealtimeEvent(
  predicate: (evt: RealtimeEvent) => boolean,
  handler: () => void,
): void {
  const ctx = useContext(RealtimeContext);

  // Keep latest predicate/handler without re-registering on every render.
  const predicateRef = useRef(predicate);
  const handlerRef = useRef(handler);
  predicateRef.current = predicate;
  handlerRef.current = handler;

  useEffect(() => {
    if (!ctx) return;
    return ctx.register({
      predicate: (evt) => predicateRef.current(evt),
      handler: () => handlerRef.current(),
    });
  }, [ctx]);
}
