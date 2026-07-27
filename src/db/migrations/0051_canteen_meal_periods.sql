ALTER TABLE "canteen_menu_items" ADD COLUMN "meal_periods" text[] DEFAULT '{allday}' NOT NULL;--> statement-breakpoint
UPDATE "canteen_menu_items" SET "meal_periods" = ARRAY["meal_period"];--> statement-breakpoint
DROP INDEX IF EXISTS "canteen_menu_items_canteen_meal_idx";--> statement-breakpoint
ALTER TABLE "canteen_menu_items" DROP COLUMN "meal_period";
