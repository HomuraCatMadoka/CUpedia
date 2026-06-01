-- Reconcile the auth tables created by migration 0000 (legacy NextAuth shape)
-- with the Better Auth shape declared in schema.ts. The project switched to
-- Better Auth via `drizzle-kit push`, so no migration ever recorded the change
-- and a from-scratch `migrate` produced unusable auth tables.
--
-- Every block is guarded: it only transforms a table still in the NextAuth
-- shape. On a fresh database these tables are empty, so DROP/CREATE is lossless;
-- on a database already on Better Auth (built via push) the guard skips it, so
-- existing auth data is untouched.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accounts' AND column_name = 'id'
  ) THEN
    DROP TABLE IF EXISTS "accounts" CASCADE;
    CREATE TABLE "accounts" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "account_id" text NOT NULL,
      "provider_id" text NOT NULL,
      "user_id" uuid NOT NULL,
      "access_token" text,
      "refresh_token" text,
      "id_token" text,
      "access_token_expires_at" timestamp,
      "refresh_token_expires_at" timestamp,
      "scope" text,
      "password" text,
      "created_at" timestamp DEFAULT now() NOT NULL,
      "updated_at" timestamp DEFAULT now() NOT NULL,
      CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
    );
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sessions' AND column_name = 'token'
  ) THEN
    DROP TABLE IF EXISTS "sessions" CASCADE;
    CREATE TABLE "sessions" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "expires_at" timestamp NOT NULL,
      "token" text NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL,
      "updated_at" timestamp DEFAULT now() NOT NULL,
      "ip_address" text,
      "user_agent" text,
      "user_id" uuid NOT NULL,
      CONSTRAINT "sessions_token_unique" UNIQUE("token"),
      CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
    );
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'verifications'
  ) THEN
    DROP TABLE IF EXISTS "verification_tokens" CASCADE;
    CREATE TABLE "verifications" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "identifier" text NOT NULL,
      "value" text NOT NULL,
      "expires_at" timestamp NOT NULL,
      "created_at" timestamp DEFAULT now(),
      "updated_at" timestamp DEFAULT now()
    );
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'email_verified'
      AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE "users" ALTER COLUMN "email_verified" DROP DEFAULT;
    ALTER TABLE "users" ALTER COLUMN "email_verified" TYPE boolean USING (email_verified IS NOT NULL);
    ALTER TABLE "users" ALTER COLUMN "email_verified" SET DEFAULT false;
    ALTER TABLE "users" ALTER COLUMN "email_verified" SET NOT NULL;
  END IF;
END $$;
