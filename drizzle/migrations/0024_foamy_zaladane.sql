DELETE FROM "permissions" WHERE "permission_id" = 'settings.manage';--> statement-breakpoint
DROP TABLE "app_settings" CASCADE;
