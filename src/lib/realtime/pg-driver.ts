import { client } from "@/database/db";

/**
 * Driver-isolated Postgres LISTEN/NOTIFY.
 *
 * This is the ONLY file in the realtime layer that knows which Postgres driver
 * is in use. To swap drivers later, edit only this file — the hub
 * (`server.ts`), the SSE route, and the client stay unchanged.
 *
 * DRIVER ASYMMETRY (important for the future Neon-serverless failback):
 *   - postgres-js (today): `client.listen()` owns a dedicated connection and
 *     AUTO-reconnects + re-LISTENs on drop. Nothing to manage.
 *   - @neondatabase/serverless (future): needs an explicit dedicated `Client`,
 *     `connect()`, `query('LISTEN ...')`, `on('notification', ...)`, and MANUAL
 *     reconnect — it does not auto-resubscribe. Implement that reconnect loop
 *     here if/when the driver is swapped.
 */

export type ListenHandle = { stop(): Promise<void> };

/**
 * Start listening on `channel`, invoking `onNotify` with each raw NOTIFY
 * payload string. postgres-js re-establishes the LISTEN automatically after a
 * connection drop, so callers get a warm subscription for the process lifetime.
 */
export async function startListening(
  channel: string,
  onNotify: (raw: string) => void,
): Promise<ListenHandle> {
  const request = await client.listen(channel, onNotify);
  return {
    async stop() {
      await request.unlisten();
    },
  };
}

/** Publish `payload` on `channel` via `pg_notify`. */
export async function publish(channel: string, payload: string): Promise<void> {
  await client.notify(channel, payload);
}
