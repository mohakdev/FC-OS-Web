import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { profiles } from "./profiles";

// A member's self-editable profile extras (Customize dialog). Kept off
// `profiles` so that table stays identity + approval state only. One row per
// profile, created lazily on first save.
export type ProfileLink = { url: string };

export const profileDetails = pgTable("profile_details", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => profiles.id, { onDelete: "cascade" }),
  // Display quote, ≤150 chars (enforced in `src/lib/validation/profile.ts`).
  quote: text("quote"),
  // Up to 3 links; icon + label are derived from the hostname at render time.
  links: jsonb("links").$type<ProfileLink[]>().notNull().default([]),
  // MinIO object key of the current avatar; null = show initials.
  avatarKey: text("avatar_key"),
  // Bumped on every avatar change; used as the `?v=` cache-buster.
  avatarUpdatedAt: timestamp("avatar_updated_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type ProfileDetails = typeof profileDetails.$inferSelect;
export type NewProfileDetails = typeof profileDetails.$inferInsert;
