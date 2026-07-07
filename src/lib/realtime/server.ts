import { REALTIME_CHANNEL, type RealtimeEvent } from "./notify";
import { startListening } from "./pg-driver";

/**
 * Process-wide realtime hub.
 *
 * One Postgres LISTEN connection per Node process (NOT per client). Incoming
 * NOTIFYs are parsed and fanned out to an in-memory Set of subscribers (the SSE
 * route registers one callback per open browser connection).
 *
 * The hub is stored on `globalThis` and guarded so that Next's dev HMR does not
 * open a fresh LISTEN socket + leak subscribers on every save. The listen
 * connection is kept warm for the whole process lifetime — we never close it on
 * the last unsubscribe.
 */

type Subscriber = (evt: RealtimeEvent) => void;

type Hub = {
  subscribers: Set<Subscriber>;
  /** Resolves once the LISTEN is established; guards against double-init. */
  started: Promise<void>;
};

const GLOBAL_KEY = Symbol.for("fc-os.realtime.hub");

type GlobalWithHub = typeof globalThis & { [GLOBAL_KEY]?: Hub };

function fanout(hub: Hub, raw: string): void {
  let evt: RealtimeEvent;
  try {
    evt = JSON.parse(raw) as RealtimeEvent;
  } catch {
    console.error("[realtime] dropped malformed NOTIFY payload:", raw);
    return;
  }
  for (const cb of hub.subscribers) {
    try {
      cb(evt);
    } catch (err) {
      console.error("[realtime] subscriber threw:", err);
    }
  }
}

function getHub(): Hub {
  const g = globalThis as GlobalWithHub;
  if (g[GLOBAL_KEY]) return g[GLOBAL_KEY];

  const hub: Hub = {
    subscribers: new Set(),
    started: Promise.resolve(),
  };
  hub.started = startListening(REALTIME_CHANNEL, (raw) => fanout(hub, raw))
    .then(() => {
      console.log(`[realtime] listening on ${REALTIME_CHANNEL}`);
    })
    .catch((err) => {
      console.error("[realtime] failed to start LISTEN:", err);
    });

  g[GLOBAL_KEY] = hub;
  return hub;
}

/**
 * Register a subscriber. Returns an unsubscribe function. Ensures the process
 * LISTEN is running (idempotent). The returned promise resolves once the hub is
 * listening, so callers can be sure they won't miss NOTIFYs sent afterwards.
 */
export async function subscribe(cb: Subscriber): Promise<() => void> {
  const hub = getHub();
  await hub.started;
  hub.subscribers.add(cb);
  return () => {
    hub.subscribers.delete(cb);
  };
}
