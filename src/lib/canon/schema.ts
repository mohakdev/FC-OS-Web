// Zod v4 payload for saving a Canon event. Client-safe.
import { z } from "zod";
import {
  DATE_KINDS,
  DATE_STATUSES,
  NAME_MAX,
  PARTICIPATIONS,
  SHORT_DESC_MAX,
  TEAM_MAX,
  TEAM_MIN,
  VENUE_STATUSES,
} from "./constants";

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date.");

const trimmed = (max: number) => z.string().trim().max(max);

export const eventDateSchema = z
  .object({
    kind: z.enum(DATE_KINDS),
    startDate: isoDay,
    endDate: isoDay.nullable(),
    status: z.enum(DATE_STATUSES),
  })
  .refine((d) => !d.endDate || d.endDate >= d.startDate, {
    message: "End date can't be before the start date.",
  });

export const eventSaveSchema = z
  .object({
    name: trimmed(NAME_MAX).min(1, "Event name is required."),
    categoryId: z.uuid(),
    isPaid: z.boolean(),
    fee: z.number().int().min(0).max(1_000_000).nullable(),
    participation: z.enum(PARTICIPATIONS),
    teamMin: z.number().int().nullable(),
    teamMax: z.number().int().nullable(),
    shortDesc: trimmed(SHORT_DESC_MAX),
    spocIds: z.array(z.uuid()).max(20),
    dates: z.array(eventDateSchema).max(DATE_KINDS.length),
    venues: z
      .array(
        z.object({
          name: trimmed(200).min(1, "Venue name is required."),
          days: trimmed(100).nullable(),
          status: z.enum(VENUE_STATUSES),
        }),
      )
      .max(30),
    phases: z
      .array(
        z.object({
          title: trimmed(200).min(1, "Phase title is required."),
          body: trimmed(10_000),
        }),
      )
      .max(50),
  })
  .refine((e) => new Set(e.dates.map((d) => d.kind)).size === e.dates.length, {
    message: "Each date type can appear only once.",
  })
  .refine((e) => new Set(e.spocIds).size === e.spocIds.length, {
    message: "A SPOC is listed twice.",
  })
  .superRefine((e, ctx) => {
    if (e.participation === "individual") return;
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message, path: ["teamMin"] });
    if (e.teamMin == null || e.teamMax == null) {
      return issue("Set a min and max team size.");
    }
    if (e.teamMin < TEAM_MIN) return issue(`Min team size is ${TEAM_MIN}.`);
    if (e.teamMax > TEAM_MAX) return issue(`Max team size is ${TEAM_MAX}.`);
    if (e.teamMin > e.teamMax)
      return issue("Min team size can't be above max.");
  })
  .transform((e) => ({
    ...e,
    fee: e.isPaid ? e.fee : null,
    teamMin: e.participation === "individual" ? null : e.teamMin,
    teamMax: e.participation === "individual" ? null : e.teamMax,
  }));

export type EventSaveInput = z.input<typeof eventSaveSchema>;
export type EventSaveData = z.output<typeof eventSaveSchema>;
