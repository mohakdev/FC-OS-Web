CREATE TYPE "public"."canon_date_kind" AS ENUM('event', 'marketing', 'registration');--> statement-breakpoint
CREATE TYPE "public"."canon_date_status" AS ENUM('tentative', 'confirmed');--> statement-breakpoint
CREATE TYPE "public"."canon_venue_status" AS ENUM('not_booked', 'unconfirmed', 'confirmed', 'booked');--> statement-breakpoint
CREATE TYPE "public"."canon_event_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "public"."canon_participation" AS ENUM('individual', 'team', 'both');--> statement-breakpoint
CREATE TABLE "canon_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "canon_categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "canon_event_dates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"kind" "canon_date_kind" NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"status" "canon_date_status" DEFAULT 'tentative' NOT NULL,
	CONSTRAINT "canon_event_dates_event_kind_unique" UNIQUE("event_id","kind")
);
--> statement-breakpoint
CREATE TABLE "canon_event_phases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canon_event_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"actor_id" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"changed_fields" text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canon_event_spocs" (
	"event_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "canon_event_spocs_event_id_profile_id_pk" PRIMARY KEY("event_id","profile_id")
);
--> statement-breakpoint
CREATE TABLE "canon_event_venues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"name" text NOT NULL,
	"days" text,
	"status" "canon_venue_status" DEFAULT 'not_booked' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canon_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(80) NOT NULL,
	"category_id" uuid NOT NULL,
	"is_paid" boolean DEFAULT false NOT NULL,
	"fee" integer,
	"participation" "canon_participation" DEFAULT 'individual' NOT NULL,
	"team_min" integer,
	"team_max" integer,
	"short_desc" text DEFAULT '' NOT NULL,
	"status" "canon_event_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "canon_events_team_size_check" CHECK (("canon_events"."participation" = 'individual' AND "canon_events"."team_min" IS NULL AND "canon_events"."team_max" IS NULL)
        OR ("canon_events"."participation" <> 'individual' AND "canon_events"."team_min" IS NOT NULL AND "canon_events"."team_max" IS NOT NULL
            AND "canon_events"."team_min" >= 2 AND "canon_events"."team_min" <= "canon_events"."team_max" AND "canon_events"."team_max" <= 10))
);
--> statement-breakpoint
ALTER TABLE "canon_event_dates" ADD CONSTRAINT "canon_event_dates_event_id_canon_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."canon_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canon_event_phases" ADD CONSTRAINT "canon_event_phases_event_id_canon_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."canon_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canon_event_revisions" ADD CONSTRAINT "canon_event_revisions_event_id_canon_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."canon_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canon_event_revisions" ADD CONSTRAINT "canon_event_revisions_actor_id_profiles_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canon_event_spocs" ADD CONSTRAINT "canon_event_spocs_event_id_canon_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."canon_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canon_event_spocs" ADD CONSTRAINT "canon_event_spocs_profile_id_profiles_user_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canon_event_venues" ADD CONSTRAINT "canon_event_venues_event_id_canon_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."canon_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canon_events" ADD CONSTRAINT "canon_events_category_id_canon_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."canon_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canon_events" ADD CONSTRAINT "canon_events_created_by_profiles_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canon_events" ADD CONSTRAINT "canon_events_updated_by_profiles_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("user_id") ON DELETE set null ON UPDATE no action;