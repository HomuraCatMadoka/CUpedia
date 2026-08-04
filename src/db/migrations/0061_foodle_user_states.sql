CREATE TABLE "foodle_user_states" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"decisions" jsonb DEFAULT '{"version":1,"byRestaurantId":{}}'::jsonb NOT NULL,
	"match_result" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "foodle_user_states" ADD CONSTRAINT "foodle_user_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;