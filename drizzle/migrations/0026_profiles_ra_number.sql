ALTER TABLE "profiles" ADD COLUMN "ra_number" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_ra_number_unique" UNIQUE("ra_number");