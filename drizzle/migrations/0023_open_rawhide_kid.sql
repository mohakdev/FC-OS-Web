CREATE TABLE "profile_details" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"quote" text,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"avatar_key" text,
	"avatar_updated_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profile_details" ADD CONSTRAINT "profile_details_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;