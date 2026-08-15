-- Retire only the expand-rollout cross-generation guardrails. The shadow
-- columns, their pair check/index, and every historical row remain intact so
-- the immediately previous application can continue dual-writing during the
-- deployment handoff.
SET LOCAL lock_timeout = '5s';--> statement-breakpoint
SET LOCAL statement_timeout = '60s';--> statement-breakpoint
ALTER TABLE "canteen_menu_items" DROP CONSTRAINT "canteen_menu_items_rollout_identity_chk";--> statement-breakpoint
DROP TRIGGER "canteen_menu_items_fill_normalized_identity_trg" ON "canteen_menu_items";--> statement-breakpoint
DROP FUNCTION "canteen_menu_items_fill_normalized_identity"();
