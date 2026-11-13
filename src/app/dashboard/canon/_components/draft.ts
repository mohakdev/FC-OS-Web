// Client-side editor model for one Canon event + conversions to/from the
// server shapes. Rows carry a client `key` so React keeps focus across reorder.

import type { DateKind, Participation } from "@/lib/canon/constants";
import type { EventSaveInput } from "@/lib/canon/schema";
import type {
  CanonDate,
  CanonEventDetail,
  CanonPerson,
  CanonPhase,
  CanonVenue,
} from "@/utils/canonDbActions";

export type Keyed<T> = T & { key: string };

export type Draft = {
  name: string;
  categoryId: string;
  isPaid: boolean;
  fee: number | null;
  participation: Participation;
  teamMin: number | null;
  teamMax: number | null;
  shortDesc: string;
  spocs: CanonPerson[];
  dates: Record<DateKind, CanonDate | null>;
  venues: Keyed<CanonVenue>[];
  phases: Keyed<CanonPhase>[];
};

const key = () => crypto.randomUUID();

export const toDraft = (e: CanonEventDetail): Draft => ({
  name: e.name,
  categoryId: e.categoryId,
  isPaid: e.isPaid,
  fee: e.fee,
  participation: e.participation,
  teamMin: e.teamMin,
  teamMax: e.teamMax,
  shortDesc: e.shortDesc,
  spocs: e.spocs,
  dates: {
    event: e.dates.find((d) => d.kind === "event") ?? null,
    marketing: e.dates.find((d) => d.kind === "marketing") ?? null,
    registration: e.dates.find((d) => d.kind === "registration") ?? null,
  },
  venues: e.venues.map((v) => ({ ...v, key: key() })),
  phases: e.phases.map((p) => ({ ...p, key: key() })),
});

export const newVenue = (): Keyed<CanonVenue> => ({
  key: key(),
  name: "",
  days: null,
  status: "not_booked",
});

export const newPhase = (): Keyed<CanonPhase> => ({
  key: key(),
  title: "",
  body: "",
});

export const toPayload = (d: Draft): EventSaveInput => ({
  name: d.name,
  categoryId: d.categoryId,
  isPaid: d.isPaid,
  fee: d.isPaid ? d.fee : null,
  participation: d.participation,
  teamMin: d.participation === "individual" ? null : d.teamMin,
  teamMax: d.participation === "individual" ? null : d.teamMax,
  shortDesc: d.shortDesc,
  spocIds: d.spocs.map((s) => s.id),
  dates: Object.values(d.dates).filter((x): x is CanonDate => x !== null),
  venues: d.venues.map(({ name, days, status }) => ({
    name,
    days: days?.trim() ? days : null,
    status,
  })),
  phases: d.phases.map(({ title, body }) => ({ title, body })),
});

/** Moves item `i` by `dir` (-1 up / +1 down); no-op at the ends. */
export function move<T>(list: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j] as T, next[i] as T];
  return next;
}
