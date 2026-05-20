CREATE TABLE "magic_link_rate_limits" (
	"identifier" text PRIMARY KEY NOT NULL,
	"last_attempted_at" timestamp NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
