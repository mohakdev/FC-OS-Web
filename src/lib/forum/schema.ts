// Forum input validation (Zod). Shared by the Server Actions; the client form
// sends the raw shape and shows the first issue message on failure.

import { z } from "zod";
import { DOMAIN_IDS } from "@/lib/opus/format";
import {
  DESCRIPTION_MAX,
  MEETING_KINDS,
  TITLE_MAX,
  VENUE_MAX,
} from "./constants";
import { istToDate } from "./format";

/**
 * A meeting as the form submits it: a single IST day, a start time and an
 * optional end time on the same day. Transformed into `startsAt` / `endsAt`.
 */
export const meetingInputSchema = z
  .object({
    kind: z.enum(MEETING_KINDS),
    domain: z.enum(DOMAIN_IDS).nullable(),
    title: z
      .string()
      .trim()
      .min(1, "Give the meeting a title.")
      .max(TITLE_MAX, `Keep the title under ${TITLE_MAX} characters.`),
    description: z
      .string()
      .trim()
      .max(
        DESCRIPTION_MAX,
        `Keep the description under ${DESCRIPTION_MAX} characters.`,
      )
      .default(""),
    venue: z
      .string()
      .trim()
      .max(VENUE_MAX, `Keep the venue under ${VENUE_MAX} characters.`)
      .nullable()
      .transform((v) => (v ? v : null)),
    date: z.string().min(1, "Pick a date."),
    startTime: z.string().min(1, "Pick a start time."),
    endTime: z
      .string()
      .nullable()
      .transform((v) => (v ? v : null)),
    notify: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    // domain_meeting needs a domain, club_meeting has none, and an
    // associate-leads meeting may go either way (one domain, or all of them).
    if (v.kind === "domain_meeting" && v.domain === null) {
      ctx.addIssue({
        code: "custom",
        path: ["domain"],
        message: "Pick the domain this meeting is for.",
      });
    }
    if (v.kind === "club_meeting" && v.domain !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["domain"],
        message: "A full-team meeting has no domain.",
      });
    }
    const start = istToDate(v.date, v.startTime);
    if (!start) {
      ctx.addIssue({
        code: "custom",
        path: ["startTime"],
        message: "Invalid date or start time.",
      });
      return;
    }
    if (v.endTime) {
      const end = istToDate(v.date, v.endTime);
      if (!end || end <= start) {
        ctx.addIssue({
          code: "custom",
          path: ["endTime"],
          message: "The end time must be after the start time.",
        });
      }
    }
  })
  .transform((v) => ({
    kind: v.kind,
    domain: v.domain,
    title: v.title,
    description: v.description,
    venue: v.venue,
    startsAt: istToDate(v.date, v.startTime) as Date,
    endsAt: v.endTime ? istToDate(v.date, v.endTime) : null,
    notify: v.notify,
  }));

export type MeetingInput = z.input<typeof meetingInputSchema>;
export type MeetingValues = z.output<typeof meetingInputSchema>;
