import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schemas";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set in the environment");
}

// Self-hosted Postgres (postgres-js). SSL is driven by the connection string
// (`?sslmode=` / `?ssl=`), so localhost needs no flag here. Unlike the old
// neon-http driver, this one has real interactive transactions — see the
// `db.transaction` usage in dbActions.ts / opusDbActions.ts.
// Exported so the realtime layer (`src/lib/realtime/pg-driver.ts`) can reuse the
// same postgres-js connection for LISTEN/NOTIFY. postgres-js owns a dedicated
// connection per `.listen()` and auto-reconnects + re-LISTENs on drop.
export const client = postgres(databaseUrl);
export const db = drizzle(client, { schema });
