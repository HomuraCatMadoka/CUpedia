CREATE TABLE "canteen_shame_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canteen_id" uuid NOT NULL,
	"user_id" uuid,
	"anonymous_session_id" uuid,
	"vote_date" date NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "canteen_shame_votes" ADD CONSTRAINT "canteen_shame_votes_canteen_id_canteens_id_fk" FOREIGN KEY ("canteen_id") REFERENCES "public"."canteens"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "canteen_shame_votes" ADD CONSTRAINT "canteen_shame_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "canteen_shame_votes" ADD CONSTRAINT "canteen_shame_votes_identity_chk" CHECK ((
        ("user_id" IS NOT NULL AND "anonymous_session_id" IS NULL) OR
        ("user_id" IS NULL AND "anonymous_session_id" IS NOT NULL)
      ));
--> statement-breakpoint
CREATE INDEX "canteen_shame_votes_date_canteen_idx" ON "canteen_shame_votes" USING btree ("vote_date","canteen_id");
--> statement-breakpoint
CREATE INDEX "canteen_shame_votes_canteen_id_idx" ON "canteen_shame_votes" USING btree ("canteen_id");
