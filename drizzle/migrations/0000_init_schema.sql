CREATE TYPE "public"."domain" AS ENUM('technical', 'creatives', 'operations', 'outreach');--> statement-breakpoint
CREATE TYPE "public"."role_label" AS ENUM('member', 'associate lead', 'co-lead', 'lead', 'human resource manager', 'leadership');--> statement-breakpoint
CREATE TABLE "domains" (
	"domain_id" serial PRIMARY KEY NOT NULL,
	"label" "domain"
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" integer NOT NULL,
	"role_id" integer NOT NULL,
	"domain_id" integer,
	CONSTRAINT "profiles_email_unique" UNIQUE("email"),
	CONSTRAINT "profiles_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"role_id" serial PRIMARY KEY NOT NULL,
	"label" "role_label" DEFAULT 'member'
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_role_id_roles_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("role_id") ON DELETE set default ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_domain_id_domains_domain_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("domain_id") ON DELETE cascade ON UPDATE no action;