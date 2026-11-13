// `YYYY-MM-DD` (Postgres `date`) ↔ local Date. Never via `new Date("YYYY-MM-DD")`:
// that parses as UTC midnight and lands on the previous day west of Greenwich.

export const parseIsoDate = (iso: string | null) => {
  if (!iso) return undefined;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export const toIsoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** "14 November 2006". */
export const formatDob = (date: Date) =>
  date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

/** Formats a stored `YYYY-MM-DD` date of birth, or null if unset. */
export const formatIsoDob = (iso: string | null) => {
  const date = parseIsoDate(iso);
  return date ? formatDob(date) : null;
};
