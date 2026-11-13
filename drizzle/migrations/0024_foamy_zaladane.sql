DELETE FROM "permissions" WHERE "id" = 'settings.manage';--> statement-breakpoint
DROP TABLE "app_settings" CASCADE;
