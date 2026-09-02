CREATE TABLE "campus_map_place_photo_assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" uuid,
	"source_sha256" text NOT NULL,
	"full_object_key" text NOT NULL,
	"thumbnail_object_key" text NOT NULL,
	"full_width" integer NOT NULL,
	"full_height" integer NOT NULL,
	"full_byte_size" integer NOT NULL,
	"thumbnail_width" integer NOT NULL,
	"thumbnail_height" integer NOT NULL,
	"thumbnail_byte_size" integer NOT NULL,
	"processing_version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"upload_token" uuid,
	"upload_lease_expires_at" timestamp with time zone,
	"ready_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campus_map_place_photo_assets_full_object_key_unique" UNIQUE("full_object_key"),
	CONSTRAINT "campus_map_place_photo_assets_thumbnail_object_key_unique" UNIQUE("thumbnail_object_key"),
	CONSTRAINT "campus_map_place_photo_source_hash_check" CHECK (char_length("campus_map_place_photo_assets"."source_sha256") = 64 and "campus_map_place_photo_assets"."source_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "campus_map_place_photo_object_keys_check" CHECK ("campus_map_place_photo_assets"."full_object_key" like 'campus-map/place-photos/%/full.webp'
        and "campus_map_place_photo_assets"."thumbnail_object_key" like 'campus-map/place-photos/%/thumbnail.webp'
        and "campus_map_place_photo_assets"."full_object_key" not like '%..%'
        and "campus_map_place_photo_assets"."thumbnail_object_key" not like '%..%'),
	CONSTRAINT "campus_map_place_photo_dimensions_check" CHECK ("campus_map_place_photo_assets"."full_width" between 1 and 1600
        and "campus_map_place_photo_assets"."full_height" between 1 and 1600
        and "campus_map_place_photo_assets"."thumbnail_width" between 1 and 480
        and "campus_map_place_photo_assets"."thumbnail_height" between 1 and 320),
	CONSTRAINT "campus_map_place_photo_sizes_check" CHECK ("campus_map_place_photo_assets"."full_byte_size" between 1 and 5242880
        and "campus_map_place_photo_assets"."thumbnail_byte_size" between 1 and 5242880),
	CONSTRAINT "campus_map_place_photo_processing_version_check" CHECK ("campus_map_place_photo_assets"."processing_version" > 0),
	CONSTRAINT "campus_map_place_photo_status_check" CHECK ((
        "campus_map_place_photo_assets"."status" = 'pending'
        and "campus_map_place_photo_assets"."ready_at" is null
        and "campus_map_place_photo_assets"."expires_at" is not null
        and "campus_map_place_photo_assets"."upload_token" is not null
        and "campus_map_place_photo_assets"."upload_lease_expires_at" is not null
      ) or (
        "campus_map_place_photo_assets"."status" = 'ready'
        and "campus_map_place_photo_assets"."ready_at" is not null
        and "campus_map_place_photo_assets"."upload_token" is null
        and "campus_map_place_photo_assets"."upload_lease_expires_at" is null
      ) or (
        "campus_map_place_photo_assets"."status" = 'deleting'
        and "campus_map_place_photo_assets"."expires_at" is not null
        and "campus_map_place_photo_assets"."upload_token" is null
        and "campus_map_place_photo_assets"."upload_lease_expires_at" is null
      )),
	CONSTRAINT "campus_map_place_photo_timestamps_check" CHECK ("campus_map_place_photo_assets"."updated_at" >= "campus_map_place_photo_assets"."created_at"
        and ("campus_map_place_photo_assets"."ready_at" is null or "campus_map_place_photo_assets"."ready_at" >= "campus_map_place_photo_assets"."created_at")
        and ("campus_map_place_photo_assets"."upload_lease_expires_at" is null or "campus_map_place_photo_assets"."upload_lease_expires_at" >= "campus_map_place_photo_assets"."created_at"))
);
--> statement-breakpoint
ALTER TABLE "campus_map_place_photo_assets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "campus_map_place_photo_upload_limits" (
	"actor_user_id" uuid PRIMARY KEY NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campus_map_place_photo_upload_attempt_count_check" CHECK ("campus_map_place_photo_upload_limits"."attempt_count" between 0 and 18),
	CONSTRAINT "campus_map_place_photo_upload_window_check" CHECK ("campus_map_place_photo_upload_limits"."updated_at" >= "campus_map_place_photo_upload_limits"."window_started_at")
);
--> statement-breakpoint
ALTER TABLE "campus_map_place_photo_upload_limits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "campus_map_revision_photos" (
	"revision_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"role" text NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campus_map_revision_photos_revision_id_asset_id_pk" PRIMARY KEY("revision_id","asset_id"),
	CONSTRAINT "campus_map_revision_photos_role_check" CHECK ("campus_map_revision_photos"."role" in ('entrance', 'overview', 'interior', 'equipment', 'accessibility')),
	CONSTRAINT "campus_map_revision_photos_sort_order_check" CHECK ("campus_map_revision_photos"."sort_order" between 0 and 2)
);
--> statement-breakpoint
ALTER TABLE "campus_map_revision_photos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "campus_map_place_photo_assets" ADD CONSTRAINT "campus_map_place_photo_assets_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_place_photo_upload_limits" ADD CONSTRAINT "campus_map_place_photo_upload_limits_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_revision_photos" ADD CONSTRAINT "campus_map_revision_photos_revision_id_campus_map_fact_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."campus_map_fact_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_revision_photos" ADD CONSTRAINT "campus_map_revision_photos_asset_id_campus_map_place_photo_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."campus_map_place_photo_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campus_map_place_photo_owner_created_idx" ON "campus_map_place_photo_assets" USING btree ("owner_user_id","created_at");--> statement-breakpoint
CREATE INDEX "campus_map_place_photo_cleanup_idx" ON "campus_map_place_photo_assets" USING btree ("expires_at","id") WHERE "campus_map_place_photo_assets"."expires_at" is not null;--> statement-breakpoint
CREATE INDEX "campus_map_revision_photos_asset_idx" ON "campus_map_revision_photos" USING btree ("asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campus_map_revision_photos_order_uq" ON "campus_map_revision_photos" USING btree ("revision_id","sort_order");