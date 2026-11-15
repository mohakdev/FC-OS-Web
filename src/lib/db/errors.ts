// Postgres error helpers. Drizzle wraps driver errors (postgres-js), so the
// SQLSTATE can sit on the error itself or on its `cause`.

type PgErrorShape = { code?: string; constraint_name?: string };

const pgError = (e: unknown): PgErrorShape | null => {
  if (typeof e !== "object" || e === null) return null;
  const err = e as PgErrorShape & { cause?: PgErrorShape };
  if (err.code === "23505") return err;
  if (err.cause?.code === "23505") return err.cause;
  return null;
};

/** True for a UNIQUE violation (SQLSTATE 23505). */
export const isUniqueViolation = (e: unknown) => pgError(e) !== null;

/**
 * The violated constraint's name (e.g. `profiles_ra_number_unique`), or null
 * when `e` is not a UNIQUE violation. Lets a caller that writes several unique
 * columns tell the user which one collided.
 */
export const uniqueViolationConstraint = (e: unknown): string | null => {
  const err = pgError(e);
  return err ? (err.constraint_name ?? "") : null;
};
