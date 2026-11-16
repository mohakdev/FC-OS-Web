-- Forum is internal meetings only: drop the unused 'external' kind and make starts_at required.
-- Hand-edited: drizzle-kit omitted dropping forum_events_domain_kind_check, which compares
-- "kind" with an enum literal and blocks the text round-trip below (re-added unchanged).
ALTER TABLE "forum_events" DROP CONSTRAINT "forum_events_domain_kind_check";--> statement-breakpoint
ALTER TABLE "forum_events" DROP CONSTRAINT "forum_events_time_order_check";--> statement-breakpoint
ALTER TABLE "forum_events" ALTER COLUMN "kind" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."forum_event_kind";--> statement-breakpoint
CREATE TYPE "public"."forum_event_kind" AS ENUM('domain_meeting', 'club_meeting');--> statement-breakpoint
ALTER TABLE "forum_events" ALTER COLUMN "kind" SET DATA TYPE "public"."forum_event_kind" USING "kind"::"public"."forum_event_kind";--> statement-breakpoint
ALTER TABLE "forum_events" ALTER COLUMN "starts_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "forum_events" ADD CONSTRAINT "forum_events_domain_kind_check" CHECK (("forum_events"."kind" = 'domain_meeting') = ("forum_events"."domain" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "forum_events" ADD CONSTRAINT "forum_events_time_order_check" CHECK ("forum_events"."ends_at" IS NULL OR "forum_events"."ends_at" > "forum_events"."starts_at");
