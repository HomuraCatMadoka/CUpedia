DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = 'public'
			AND table_name = 'canteen_menu_items'
			AND column_name = 'meal_periods'
	) THEN
		ALTER TABLE "canteen_menu_items"
			ADD COLUMN "meal_periods" text[] DEFAULT '{allday}' NOT NULL;
	END IF;

	IF EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = 'public'
			AND table_name = 'canteen_menu_items'
			AND column_name = 'meal_period'
	) THEN
		EXECUTE 'UPDATE "canteen_menu_items" SET "meal_periods" = ARRAY["meal_period"]';
		DROP INDEX IF EXISTS "canteen_menu_items_canteen_meal_idx";
		ALTER TABLE "canteen_menu_items" DROP COLUMN "meal_period";
	END IF;
END
$$;
