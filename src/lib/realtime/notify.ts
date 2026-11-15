import { publish } from "./pg-driver";

/** Postgres NOTIFY channel shared by every realtime signal. */
export const REALTIME_CHANNEL = "fc_realtime";

/**
 * A realtime signal — a tiny hint of *what changed*, never row data. Clients
 * react by re-fetching the current route's RSC payload (the existing
 * force-dynamic + `router.refresh()` pipeline).
 */
export type RealtimeEvent =
  | { scope: "opus-board"; domain: string }
  | { scope: "member" }
  | { scope: "bug-report" }
  | { scope: "canon" }
  | { scope: "forum" };

/**
 * Broadcast a realtime signal to every Node process listening on the channel.
 * Call AFTER the DB write + `revalidatePath(...)` so listeners read fresh rows.
 */
export async function notifyRealtime(evt: RealtimeEvent): Promise<void> {
  await publish(REALTIME_CHANNEL, JSON.stringify(evt));
}
