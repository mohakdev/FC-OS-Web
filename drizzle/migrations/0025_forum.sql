CREATE TYPE "public"."forum_event_kind" AS ENUM('domain_meeting', 'club_meeting', 'external');--> statement-breakpoint
CREATE TYPE "public"."forum_event_status" AS ENUM('scheduled', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."forum_invite_kind" AS ENUM('invite', 'update', 'cancel');--> statement-breakpoint
CREATE TABLE "forum_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "forum_event_kind" NOT NULL,
	"domain" "domain",
	"title" varchar(80) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"venue" text,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"status" "forum_event_status" DEFAULT 'scheduled' NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "forum_events_domain_kind_check" CHECK (("forum_events"."kind" = 'domain_meeting') = ("forum_events"."domain" IS NOT NULL)),
	CONSTRAINT "forum_events_time_order_check" CHECK ("forum_events"."ends_at" IS NULL OR "forum_events"."starts_at" IS NULL OR "forum_events"."ends_at" > "forum_events"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "forum_invites" (
	"event_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"kind" "forum_invite_kind" NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "forum_invites_event_id_profile_id_kind_revision_pk" PRIMARY KEY("event_id","profile_id","kind","revision")
);
--> statement-breakpoint
DROP TABLE "activity" CASCADE;--> statement-breakpoint
DROP TABLE "attendance" CASCADE;--> statement-breakpoint
ALTER TABLE "forum_events" ADD CONSTRAINT "forum_events_domain_domains_domain_id_fk" FOREIGN KEY ("domain") REFERENCES "public"."domains"("domain_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_events" ADD CONSTRAINT "forum_events_created_by_profiles_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_events" ADD CONSTRAINT "forum_events_updated_by_profiles_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_invites" ADD CONSTRAINT "forum_invites_event_id_forum_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."forum_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_invites" ADD CONSTRAINT "forum_invites_profile_id_profiles_user_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "forum_events_starts_at_idx" ON "forum_events" USING btree ("starts_at");--> statement-breakpoint
DROP TYPE "public"."type";--> statement-breakpoint
DROP TYPE "public"."attendance_status";