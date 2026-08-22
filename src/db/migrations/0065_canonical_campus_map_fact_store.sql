CREATE TABLE "campus_map_building_provenance" (
	"building_id" uuid NOT NULL,
	"provenance_id" uuid NOT NULL,
	CONSTRAINT "campus_map_building_provenance_building_id_provenance_id_pk" PRIMARY KEY("building_id","provenance_id")
);
--> statement-breakpoint
CREATE TABLE "campus_map_buildings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"english_name" text,
	"code" text,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"anchor_longitude" double precision,
	"anchor_latitude" double precision,
	"anchor_crs" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campus_map_buildings_anchor_check" CHECK ((
        "campus_map_buildings"."anchor_longitude" is null
        and "campus_map_buildings"."anchor_latitude" is null
        and "campus_map_buildings"."anchor_crs" is null
      ) or (
        "campus_map_buildings"."anchor_longitude" between -180 and 180
        and "campus_map_buildings"."anchor_latitude" between -90 and 90
        and "campus_map_buildings"."anchor_crs" = 'wgs84'
      ))
);
--> statement-breakpoint
CREATE TABLE "campus_map_changesets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"actor_id_snapshot" uuid NOT NULL,
	"actor_nickname_snapshot" text NOT NULL,
	"comment" text NOT NULL,
	"source_summary" text NOT NULL,
	"review_requested" boolean DEFAULT false NOT NULL,
	"client_name" text NOT NULL,
	"client_version" text NOT NULL,
	"affected_count" integer NOT NULL,
	"created_count" integer DEFAULT 0 NOT NULL,
	"updated_count" integer DEFAULT 0 NOT NULL,
	"retired_count" integer DEFAULT 0 NOT NULL,
	"restored_count" integer DEFAULT 0 NOT NULL,
	"merged_count" integer DEFAULT 0 NOT NULL,
	"bbox_west" double precision,
	"bbox_south" double precision,
	"bbox_east" double precision,
	"bbox_north" double precision,
	"warning_summary" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reverts_changeset_id" uuid,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campus_map_changesets_counts_check" CHECK ("campus_map_changesets"."affected_count" > 0
        and "campus_map_changesets"."created_count" >= 0
        and "campus_map_changesets"."updated_count" >= 0
        and "campus_map_changesets"."retired_count" >= 0
        and "campus_map_changesets"."restored_count" >= 0
        and "campus_map_changesets"."merged_count" >= 0
        and "campus_map_changesets"."affected_count" = "campus_map_changesets"."created_count" + "campus_map_changesets"."updated_count" + "campus_map_changesets"."retired_count" + "campus_map_changesets"."restored_count" + "campus_map_changesets"."merged_count"),
	CONSTRAINT "campus_map_changesets_bbox_check" CHECK ((
        "campus_map_changesets"."bbox_west" is null and "campus_map_changesets"."bbox_south" is null
        and "campus_map_changesets"."bbox_east" is null and "campus_map_changesets"."bbox_north" is null
      ) or (
        "campus_map_changesets"."bbox_west" between -180 and 180
        and "campus_map_changesets"."bbox_east" between -180 and 180
        and "campus_map_changesets"."bbox_south" between -90 and 90
        and "campus_map_changesets"."bbox_north" between -90 and 90
        and "campus_map_changesets"."bbox_west" <= "campus_map_changesets"."bbox_east"
        and "campus_map_changesets"."bbox_south" <= "campus_map_changesets"."bbox_north"
      ))
);
--> statement-breakpoint
CREATE TABLE "campus_map_current_facts" (
	"place_id" uuid PRIMARY KEY NOT NULL,
	"revision_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"fact_schema_version" integer NOT NULL,
	"name" text NOT NULL,
	"building_id" uuid,
	"floor_id" uuid,
	"pin_type" text NOT NULL,
	"capabilities" text[] DEFAULT '{}'::text[] NOT NULL,
	"gender" text DEFAULT 'unknown' NOT NULL,
	"wheelchair_access" text DEFAULT 'unknown' NOT NULL,
	"audience" text DEFAULT 'unknown' NOT NULL,
	"credential_requirement" text DEFAULT 'unknown' NOT NULL,
	"access_schedule" jsonb DEFAULT '{"kind":"unknown"}'::jsonb NOT NULL,
	"reservation_requirement" text DEFAULT 'unknown' NOT NULL,
	"temporary_status" text DEFAULT 'unknown' NOT NULL,
	"location_kind" text NOT NULL,
	"point_precision" text,
	"longitude" double precision,
	"latitude" double precision,
	"coordinate_crs" text,
	"observed_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"verified_by_actor_id_snapshot" uuid,
	"published_at" timestamp with time zone NOT NULL,
	CONSTRAINT "campus_map_current_facts_revision_id_unique" UNIQUE("revision_id"),
	CONSTRAINT "campus_map_current_facts_active_check" CHECK ("campus_map_current_facts"."status" = 'active'),
	CONSTRAINT "campus_map_current_facts_pin_type_check" CHECK ("campus_map_current_facts"."pin_type" in ('toilet', 'water', 'printer', 'common-space', 'classroom')),
	CONSTRAINT "campus_map_current_facts_capabilities_check" CHECK ("campus_map_current_facts"."capabilities" <@ array['print', 'scan', 'copy']::text[]),
	CONSTRAINT "campus_map_current_facts_gender_check" CHECK ("campus_map_current_facts"."gender" in ('male', 'female', 'all-gender', 'unknown')),
	CONSTRAINT "campus_map_current_facts_wheelchair_access_check" CHECK ("campus_map_current_facts"."wheelchair_access" in ('yes', 'limited', 'no', 'unknown')),
	CONSTRAINT "campus_map_current_facts_audience_check" CHECK ("campus_map_current_facts"."audience" in ('public', 'cuhk-member', 'library-member', 'unknown')),
	CONSTRAINT "campus_map_current_facts_credential_requirement_check" CHECK ("campus_map_current_facts"."credential_requirement" in ('none', 'campus-card', 'library-card', 'other', 'unknown')),
	CONSTRAINT "campus_map_current_facts_schedule_kind_check" CHECK ((
        "campus_map_current_facts"."access_schedule" in ('{"kind":"unknown"}'::jsonb, '{"kind":"always"}'::jsonb)
      ) or (
        jsonb_typeof("campus_map_current_facts"."access_schedule") = 'object'
        and "campus_map_current_facts"."access_schedule"->>'kind' = 'weekly'
        and "campus_map_current_facts"."access_schedule"->>'timezone' = 'Asia/Hong_Kong'
        and jsonb_typeof("campus_map_current_facts"."access_schedule"->'intervals') = 'array'
        and jsonb_array_length("campus_map_current_facts"."access_schedule"->'intervals') > 0
        and "campus_map_current_facts"."access_schedule" - 'kind' - 'timezone' - 'intervals' = '{}'::jsonb
        and not jsonb_path_exists(
          "campus_map_current_facts"."access_schedule",
          '$.intervals[*] ? (
            @.type() != "object"
            || !exists(@.days)
            || @.days.type() != "array"
            || @.days.size() == 0
            || exists(@.days[*] ? (
              @ != "mon" && @ != "tue" && @ != "wed" && @ != "thu"
              && @ != "fri" && @ != "sat" && @ != "sun"
            ))
            || !exists(@.opensAt)
            || !(@.opensAt like_regex "^(?:[01][0-9]|2[0-3]):[0-5][0-9]$")
            || !exists(@.closesAt)
            || !(@.closesAt like_regex "^(?:[01][0-9]|2[0-3]):[0-5][0-9]$")
            || @.opensAt == @.closesAt
            || exists(@.keyvalue() ? (
              @.key != "days" && @.key != "opensAt" && @.key != "closesAt"
            ))
          )'
        )
      )),
	CONSTRAINT "campus_map_current_facts_reservation_requirement_check" CHECK ("campus_map_current_facts"."reservation_requirement" in ('none', 'required', 'unknown')),
	CONSTRAINT "campus_map_current_facts_temporary_status_check" CHECK ("campus_map_current_facts"."temporary_status" in ('normal', 'temporarily-closed', 'unknown')),
	CONSTRAINT "campus_map_current_facts_verification_check" CHECK ((
        "campus_map_current_facts"."verified_at" is null
        and "campus_map_current_facts"."verified_by_actor_id_snapshot" is null
      ) or (
        "campus_map_current_facts"."verified_at" is not null
        and "campus_map_current_facts"."verified_by_actor_id_snapshot" is not null
      )),
	CONSTRAINT "campus_map_current_facts_location_check" CHECK ((
        "campus_map_current_facts"."location_kind" = 'building'
        and "campus_map_current_facts"."building_id" is not null
        and "campus_map_current_facts"."floor_id" is null
        and "campus_map_current_facts"."point_precision" is null
        and "campus_map_current_facts"."longitude" is null
        and "campus_map_current_facts"."latitude" is null
        and "campus_map_current_facts"."coordinate_crs" is null
      ) or (
        "campus_map_current_facts"."location_kind" = 'floor'
        and "campus_map_current_facts"."building_id" is not null
        and "campus_map_current_facts"."floor_id" is not null
        and "campus_map_current_facts"."point_precision" is null
        and "campus_map_current_facts"."longitude" is null
        and "campus_map_current_facts"."latitude" is null
        and "campus_map_current_facts"."coordinate_crs" is null
      ) or (
        "campus_map_current_facts"."location_kind" = 'outdoor-point'
        and "campus_map_current_facts"."building_id" is null
        and "campus_map_current_facts"."floor_id" is null
        and "campus_map_current_facts"."point_precision" in ('approximate', 'precise')
        and "campus_map_current_facts"."longitude" between -180 and 180
        and "campus_map_current_facts"."latitude" between -90 and 90
        and "campus_map_current_facts"."coordinate_crs" = 'wgs84'
      ))
);
--> statement-breakpoint
CREATE TABLE "campus_map_current_revisions" (
	"place_id" uuid PRIMARY KEY NOT NULL,
	"revision_id" uuid NOT NULL,
	"status" text NOT NULL,
	"advanced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campus_map_current_revisions_revision_id_unique" UNIQUE("revision_id"),
	CONSTRAINT "campus_map_current_revisions_place_status_revision_uq" UNIQUE("place_id","status","revision_id"),
	CONSTRAINT "campus_map_current_revisions_status_check" CHECK ("campus_map_current_revisions"."status" in ('active', 'retired', 'merged'))
);
--> statement-breakpoint
CREATE TABLE "campus_map_fact_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"place_id" uuid NOT NULL,
	"changeset_id" uuid NOT NULL,
	"place_change_id" uuid NOT NULL,
	"previous_revision_id" uuid,
	"fact_schema_version" integer NOT NULL,
	"field_metadata" jsonb NOT NULL,
	"status" text NOT NULL,
	"merged_into_place_id" uuid,
	"actor_id_snapshot" uuid NOT NULL,
	"actor_nickname_snapshot" text NOT NULL,
	"name" text NOT NULL,
	"building_id" uuid,
	"floor_id" uuid,
	"pin_type" text NOT NULL,
	"capabilities" text[] DEFAULT '{}'::text[] NOT NULL,
	"gender" text DEFAULT 'unknown' NOT NULL,
	"wheelchair_access" text DEFAULT 'unknown' NOT NULL,
	"audience" text DEFAULT 'unknown' NOT NULL,
	"credential_requirement" text DEFAULT 'unknown' NOT NULL,
	"access_schedule" jsonb DEFAULT '{"kind":"unknown"}'::jsonb NOT NULL,
	"reservation_requirement" text DEFAULT 'unknown' NOT NULL,
	"temporary_status" text DEFAULT 'unknown' NOT NULL,
	"location_kind" text NOT NULL,
	"point_precision" text,
	"longitude" double precision,
	"latitude" double precision,
	"coordinate_crs" text,
	"observed_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"verified_by_actor_id_snapshot" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campus_map_fact_revisions_place_id_id_uq" UNIQUE("place_id","id"),
	CONSTRAINT "campus_map_fact_revisions_place_id_status_id_uq" UNIQUE("place_id","status","id"),
	CONSTRAINT "campus_map_fact_revisions_status_check" CHECK ("campus_map_fact_revisions"."status" in ('active', 'retired', 'merged')),
	CONSTRAINT "campus_map_fact_revisions_merge_target_check" CHECK ((
        "campus_map_fact_revisions"."status" = 'merged'
        and "campus_map_fact_revisions"."merged_into_place_id" is not null
        and "campus_map_fact_revisions"."merged_into_place_id" <> "campus_map_fact_revisions"."place_id"
      ) or (
        "campus_map_fact_revisions"."status" in ('active', 'retired')
        and "campus_map_fact_revisions"."merged_into_place_id" is null
      )),
	CONSTRAINT "campus_map_fact_revisions_pin_type_check" CHECK ("campus_map_fact_revisions"."pin_type" in ('toilet', 'water', 'printer', 'common-space', 'classroom')),
	CONSTRAINT "campus_map_fact_revisions_capabilities_check" CHECK ("campus_map_fact_revisions"."capabilities" <@ array['print', 'scan', 'copy']::text[]),
	CONSTRAINT "campus_map_fact_revisions_gender_check" CHECK ("campus_map_fact_revisions"."gender" in ('male', 'female', 'all-gender', 'unknown')),
	CONSTRAINT "campus_map_fact_revisions_wheelchair_access_check" CHECK ("campus_map_fact_revisions"."wheelchair_access" in ('yes', 'limited', 'no', 'unknown')),
	CONSTRAINT "campus_map_fact_revisions_audience_check" CHECK ("campus_map_fact_revisions"."audience" in ('public', 'cuhk-member', 'library-member', 'unknown')),
	CONSTRAINT "campus_map_fact_revisions_credential_requirement_check" CHECK ("campus_map_fact_revisions"."credential_requirement" in ('none', 'campus-card', 'library-card', 'other', 'unknown')),
	CONSTRAINT "campus_map_fact_revisions_schedule_kind_check" CHECK ((
        "campus_map_fact_revisions"."access_schedule" in ('{"kind":"unknown"}'::jsonb, '{"kind":"always"}'::jsonb)
      ) or (
        jsonb_typeof("campus_map_fact_revisions"."access_schedule") = 'object'
        and "campus_map_fact_revisions"."access_schedule"->>'kind' = 'weekly'
        and "campus_map_fact_revisions"."access_schedule"->>'timezone' = 'Asia/Hong_Kong'
        and jsonb_typeof("campus_map_fact_revisions"."access_schedule"->'intervals') = 'array'
        and jsonb_array_length("campus_map_fact_revisions"."access_schedule"->'intervals') > 0
        and "campus_map_fact_revisions"."access_schedule" - 'kind' - 'timezone' - 'intervals' = '{}'::jsonb
        and not jsonb_path_exists(
          "campus_map_fact_revisions"."access_schedule",
          '$.intervals[*] ? (
            @.type() != "object"
            || !exists(@.days)
            || @.days.type() != "array"
            || @.days.size() == 0
            || exists(@.days[*] ? (
              @ != "mon" && @ != "tue" && @ != "wed" && @ != "thu"
              && @ != "fri" && @ != "sat" && @ != "sun"
            ))
            || !exists(@.opensAt)
            || !(@.opensAt like_regex "^(?:[01][0-9]|2[0-3]):[0-5][0-9]$")
            || !exists(@.closesAt)
            || !(@.closesAt like_regex "^(?:[01][0-9]|2[0-3]):[0-5][0-9]$")
            || @.opensAt == @.closesAt
            || exists(@.keyvalue() ? (
              @.key != "days" && @.key != "opensAt" && @.key != "closesAt"
            ))
          )'
        )
      )),
	CONSTRAINT "campus_map_fact_revisions_reservation_requirement_check" CHECK ("campus_map_fact_revisions"."reservation_requirement" in ('none', 'required', 'unknown')),
	CONSTRAINT "campus_map_fact_revisions_temporary_status_check" CHECK ("campus_map_fact_revisions"."temporary_status" in ('normal', 'temporarily-closed', 'unknown')),
	CONSTRAINT "campus_map_fact_revisions_verification_check" CHECK ((
        "campus_map_fact_revisions"."verified_at" is null
        and "campus_map_fact_revisions"."verified_by_actor_id_snapshot" is null
      ) or (
        "campus_map_fact_revisions"."verified_at" is not null
        and "campus_map_fact_revisions"."verified_by_actor_id_snapshot" is not null
      )),
	CONSTRAINT "campus_map_fact_revisions_location_check" CHECK ((
        "campus_map_fact_revisions"."location_kind" = 'building'
        and "campus_map_fact_revisions"."building_id" is not null
        and "campus_map_fact_revisions"."floor_id" is null
        and "campus_map_fact_revisions"."point_precision" is null
        and "campus_map_fact_revisions"."longitude" is null
        and "campus_map_fact_revisions"."latitude" is null
        and "campus_map_fact_revisions"."coordinate_crs" is null
      ) or (
        "campus_map_fact_revisions"."location_kind" = 'floor'
        and "campus_map_fact_revisions"."building_id" is not null
        and "campus_map_fact_revisions"."floor_id" is not null
        and "campus_map_fact_revisions"."point_precision" is null
        and "campus_map_fact_revisions"."longitude" is null
        and "campus_map_fact_revisions"."latitude" is null
        and "campus_map_fact_revisions"."coordinate_crs" is null
      ) or (
        "campus_map_fact_revisions"."location_kind" = 'outdoor-point'
        and "campus_map_fact_revisions"."building_id" is null
        and "campus_map_fact_revisions"."floor_id" is null
        and "campus_map_fact_revisions"."point_precision" in ('approximate', 'precise')
        and "campus_map_fact_revisions"."longitude" between -180 and 180
        and "campus_map_fact_revisions"."latitude" between -90 and 90
        and "campus_map_fact_revisions"."coordinate_crs" = 'wgs84'
      ))
);
--> statement-breakpoint
CREATE TABLE "campus_map_fact_schemas" (
	"version" integer PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"definition" jsonb NOT NULL,
	"display_metadata" jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campus_map_fact_schemas_version_check" CHECK ("campus_map_fact_schemas"."version" > 0),
	CONSTRAINT "campus_map_fact_schemas_status_check" CHECK ("campus_map_fact_schemas"."status" in ('draft', 'active', 'superseded'))
);
--> statement-breakpoint
CREATE TABLE "campus_map_floor_provenance" (
	"floor_id" uuid NOT NULL,
	"provenance_id" uuid NOT NULL,
	CONSTRAINT "campus_map_floor_provenance_floor_id_provenance_id_pk" PRIMARY KEY("floor_id","provenance_id")
);
--> statement-breakpoint
CREATE TABLE "campus_map_floors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"building_id" uuid NOT NULL,
	"display_label" text NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campus_map_floors_building_id_id_uq" UNIQUE("building_id","id")
);
--> statement-breakpoint
CREATE TABLE "campus_map_place_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"changeset_id" uuid NOT NULL,
	"place_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"field_diff" jsonb NOT NULL,
	CONSTRAINT "campus_map_place_changes_place_id_id_uq" UNIQUE("place_id","id"),
	CONSTRAINT "campus_map_place_changes_changeset_id_id_uq" UNIQUE("changeset_id","id"),
	CONSTRAINT "campus_map_place_changes_operation_check" CHECK ("campus_map_place_changes"."operation" in ('create', 'update', 'retire', 'restore', 'merge'))
);
--> statement-breakpoint
CREATE TABLE "campus_map_places" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campus_map_provenance_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_kind" text NOT NULL,
	"source_ref" text NOT NULL,
	"source_url" text,
	"source_owner" text,
	"source_version" text,
	"snapshot_hash" text,
	"accessed_on" date NOT NULL,
	"observed_at" timestamp with time zone,
	"rights_status" text NOT NULL,
	"limitations" text,
	"note" text,
	"source_coordinate_x" double precision,
	"source_coordinate_y" double precision,
	"source_coordinate_crs" text,
	"conversion_method" text,
	"conversion_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campus_map_provenance_source_kind_check" CHECK ("campus_map_provenance_sources"."source_kind" in ('official', 'field-observation', 'open-data', 'provider-candidate', 'other')),
	CONSTRAINT "campus_map_provenance_rights_status_check" CHECK ("campus_map_provenance_sources"."rights_status" in ('public-domain', 'permission-granted', 'original-observation', 'restricted', 'unknown')),
	CONSTRAINT "campus_map_provenance_coordinate_lineage_check" CHECK ((
        "campus_map_provenance_sources"."source_coordinate_x" is null
        and "campus_map_provenance_sources"."source_coordinate_y" is null
        and "campus_map_provenance_sources"."source_coordinate_crs" is null
        and "campus_map_provenance_sources"."conversion_method" is null
        and "campus_map_provenance_sources"."conversion_version" is null
      ) or (
        "campus_map_provenance_sources"."source_coordinate_x" is not null
        and "campus_map_provenance_sources"."source_coordinate_y" is not null
        and "campus_map_provenance_sources"."source_coordinate_crs" in ('wgs84', 'gcj02', 'hk80', 'hkpd', 'other')
        and (
          ("campus_map_provenance_sources"."conversion_method" is null and "campus_map_provenance_sources"."conversion_version" is null)
          or (
            "campus_map_provenance_sources"."conversion_method" in ('proj', 'manual', 'provider-adapter', 'other')
            and nullif(btrim("campus_map_provenance_sources"."conversion_version"), '') is not null
          )
        )
        and (
          "campus_map_provenance_sources"."source_coordinate_crs" = 'wgs84'
          or "campus_map_provenance_sources"."conversion_method" is not null
        )
        and (
          "campus_map_provenance_sources"."source_coordinate_crs" not in ('wgs84', 'gcj02')
          or (
            "campus_map_provenance_sources"."source_coordinate_x" between -180 and 180
            and "campus_map_provenance_sources"."source_coordinate_y" between -90 and 90
          )
        )
      ))
);
--> statement-breakpoint
CREATE TABLE "campus_map_provider_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"provider_object_id" text NOT NULL,
	"target_kind" text NOT NULL,
	"building_id" uuid,
	"place_id" uuid,
	"provenance_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campus_map_provider_mappings_target_check" CHECK ((
        "campus_map_provider_mappings"."target_kind" = 'building'
        and "campus_map_provider_mappings"."building_id" is not null
        and "campus_map_provider_mappings"."place_id" is null
      ) or (
        "campus_map_provider_mappings"."target_kind" = 'place'
        and "campus_map_provider_mappings"."building_id" is null
        and "campus_map_provider_mappings"."place_id" is not null
      ))
);
--> statement-breakpoint
CREATE TABLE "campus_map_publish_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"actor_id_snapshot" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"request_fingerprint" text NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"changeset_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "campus_map_publish_requests_changeset_id_unique" UNIQUE("changeset_id"),
	CONSTRAINT "campus_map_publish_requests_result_check" CHECK ((
        "campus_map_publish_requests"."status" = 'processing'
        and "campus_map_publish_requests"."changeset_id" is null
        and "campus_map_publish_requests"."completed_at" is null
      ) or (
        "campus_map_publish_requests"."status" = 'published'
        and "campus_map_publish_requests"."changeset_id" is not null
        and "campus_map_publish_requests"."completed_at" is not null
      ))
);
--> statement-breakpoint
CREATE TABLE "campus_map_revision_provenance" (
	"revision_id" uuid NOT NULL,
	"provenance_id" uuid NOT NULL,
	CONSTRAINT "campus_map_revision_provenance_revision_id_provenance_id_pk" PRIMARY KEY("revision_id","provenance_id")
);
--> statement-breakpoint
CREATE TABLE "campus_map_revision_visibility" (
	"revision_id" uuid PRIMARY KEY NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"redaction_ref" text,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campus_map_revision_visibility_check" CHECK ((
        "campus_map_revision_visibility"."visibility" = 'public' and "campus_map_revision_visibility"."redaction_ref" is null
      ) or (
        "campus_map_revision_visibility"."visibility" = 'redacted' and "campus_map_revision_visibility"."redaction_ref" is not null
      ))
);
--> statement-breakpoint
ALTER TABLE "campus_map_building_provenance" ADD CONSTRAINT "campus_map_building_provenance_building_id_campus_map_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."campus_map_buildings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_building_provenance" ADD CONSTRAINT "campus_map_building_provenance_provenance_id_campus_map_provenance_sources_id_fk" FOREIGN KEY ("provenance_id") REFERENCES "public"."campus_map_provenance_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_changesets" ADD CONSTRAINT "campus_map_changesets_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_changesets" ADD CONSTRAINT "campus_map_changesets_reverts_changeset_id_campus_map_changesets_id_fk" FOREIGN KEY ("reverts_changeset_id") REFERENCES "public"."campus_map_changesets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_current_facts" ADD CONSTRAINT "campus_map_current_facts_place_id_campus_map_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."campus_map_places"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_current_facts" ADD CONSTRAINT "campus_map_current_facts_fact_schema_version_campus_map_fact_schemas_version_fk" FOREIGN KEY ("fact_schema_version") REFERENCES "public"."campus_map_fact_schemas"("version") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_current_facts" ADD CONSTRAINT "campus_map_current_facts_building_id_campus_map_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."campus_map_buildings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_current_facts" ADD CONSTRAINT "campus_map_current_facts_current_revision_fk" FOREIGN KEY ("place_id","status","revision_id") REFERENCES "public"."campus_map_current_revisions"("place_id","status","revision_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_current_facts" ADD CONSTRAINT "campus_map_current_facts_floor_building_fk" FOREIGN KEY ("building_id","floor_id") REFERENCES "public"."campus_map_floors"("building_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_current_revisions" ADD CONSTRAINT "campus_map_current_revisions_place_id_campus_map_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."campus_map_places"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_current_revisions" ADD CONSTRAINT "campus_map_current_revisions_revision_fk" FOREIGN KEY ("place_id","status","revision_id") REFERENCES "public"."campus_map_fact_revisions"("place_id","status","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_fact_revisions" ADD CONSTRAINT "campus_map_fact_revisions_place_id_campus_map_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."campus_map_places"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_fact_revisions" ADD CONSTRAINT "campus_map_fact_revisions_changeset_id_campus_map_changesets_id_fk" FOREIGN KEY ("changeset_id") REFERENCES "public"."campus_map_changesets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_fact_revisions" ADD CONSTRAINT "campus_map_fact_revisions_place_change_id_campus_map_place_changes_id_fk" FOREIGN KEY ("place_change_id") REFERENCES "public"."campus_map_place_changes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_fact_revisions" ADD CONSTRAINT "campus_map_fact_revisions_fact_schema_version_campus_map_fact_schemas_version_fk" FOREIGN KEY ("fact_schema_version") REFERENCES "public"."campus_map_fact_schemas"("version") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_fact_revisions" ADD CONSTRAINT "campus_map_fact_revisions_merged_into_place_id_campus_map_places_id_fk" FOREIGN KEY ("merged_into_place_id") REFERENCES "public"."campus_map_places"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_fact_revisions" ADD CONSTRAINT "campus_map_fact_revisions_building_id_campus_map_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."campus_map_buildings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_fact_revisions" ADD CONSTRAINT "campus_map_fact_revisions_previous_fk" FOREIGN KEY ("place_id","previous_revision_id") REFERENCES "public"."campus_map_fact_revisions"("place_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_fact_revisions" ADD CONSTRAINT "campus_map_fact_revisions_place_change_place_fk" FOREIGN KEY ("place_id","place_change_id") REFERENCES "public"."campus_map_place_changes"("place_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_fact_revisions" ADD CONSTRAINT "campus_map_fact_revisions_place_change_changeset_fk" FOREIGN KEY ("changeset_id","place_change_id") REFERENCES "public"."campus_map_place_changes"("changeset_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_fact_revisions" ADD CONSTRAINT "campus_map_fact_revisions_floor_building_fk" FOREIGN KEY ("building_id","floor_id") REFERENCES "public"."campus_map_floors"("building_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_fact_schemas" ADD CONSTRAINT "campus_map_fact_schemas_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_floor_provenance" ADD CONSTRAINT "campus_map_floor_provenance_floor_id_campus_map_floors_id_fk" FOREIGN KEY ("floor_id") REFERENCES "public"."campus_map_floors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_floor_provenance" ADD CONSTRAINT "campus_map_floor_provenance_provenance_id_campus_map_provenance_sources_id_fk" FOREIGN KEY ("provenance_id") REFERENCES "public"."campus_map_provenance_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_floors" ADD CONSTRAINT "campus_map_floors_building_id_campus_map_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."campus_map_buildings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_place_changes" ADD CONSTRAINT "campus_map_place_changes_changeset_id_campus_map_changesets_id_fk" FOREIGN KEY ("changeset_id") REFERENCES "public"."campus_map_changesets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_place_changes" ADD CONSTRAINT "campus_map_place_changes_place_id_campus_map_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."campus_map_places"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_provider_mappings" ADD CONSTRAINT "campus_map_provider_mappings_building_id_campus_map_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."campus_map_buildings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_provider_mappings" ADD CONSTRAINT "campus_map_provider_mappings_place_id_campus_map_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."campus_map_places"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_provider_mappings" ADD CONSTRAINT "campus_map_provider_mappings_provenance_id_campus_map_provenance_sources_id_fk" FOREIGN KEY ("provenance_id") REFERENCES "public"."campus_map_provenance_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_publish_requests" ADD CONSTRAINT "campus_map_publish_requests_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_publish_requests" ADD CONSTRAINT "campus_map_publish_requests_changeset_id_campus_map_changesets_id_fk" FOREIGN KEY ("changeset_id") REFERENCES "public"."campus_map_changesets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_revision_provenance" ADD CONSTRAINT "campus_map_revision_provenance_revision_id_campus_map_fact_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."campus_map_fact_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_revision_provenance" ADD CONSTRAINT "campus_map_revision_provenance_provenance_id_campus_map_provenance_sources_id_fk" FOREIGN KEY ("provenance_id") REFERENCES "public"."campus_map_provenance_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_revision_visibility" ADD CONSTRAINT "campus_map_revision_visibility_revision_id_campus_map_fact_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."campus_map_fact_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_map_revision_visibility" ADD CONSTRAINT "campus_map_revision_visibility_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campus_map_building_provenance_source_idx" ON "campus_map_building_provenance" USING btree ("provenance_id");--> statement-breakpoint
CREATE INDEX "campus_map_buildings_name_idx" ON "campus_map_buildings" USING btree ("name");--> statement-breakpoint
CREATE INDEX "campus_map_buildings_anchor_geo_idx" ON "campus_map_buildings" USING btree ("anchor_longitude","anchor_latitude") WHERE "campus_map_buildings"."anchor_crs" = 'wgs84';--> statement-breakpoint
CREATE INDEX "campus_map_changesets_feed_idx" ON "campus_map_changesets" USING btree ("published_at","id");--> statement-breakpoint
CREATE INDEX "campus_map_changesets_actor_user_idx" ON "campus_map_changesets" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "campus_map_changesets_reverts_idx" ON "campus_map_changesets" USING btree ("reverts_changeset_id");--> statement-breakpoint
CREATE INDEX "campus_map_changesets_actor_feed_idx" ON "campus_map_changesets" USING btree ("actor_id_snapshot","published_at");--> statement-breakpoint
CREATE INDEX "campus_map_changesets_review_feed_idx" ON "campus_map_changesets" USING btree ("published_at","id") WHERE "campus_map_changesets"."review_requested" = true;--> statement-breakpoint
CREATE INDEX "campus_map_current_facts_building_type_idx" ON "campus_map_current_facts" USING btree ("building_id","pin_type");--> statement-breakpoint
CREATE INDEX "campus_map_current_facts_floor_type_idx" ON "campus_map_current_facts" USING btree ("building_id","floor_id","pin_type");--> statement-breakpoint
CREATE INDEX "campus_map_current_facts_geo_idx" ON "campus_map_current_facts" USING btree ("longitude","latitude") WHERE "campus_map_current_facts"."location_kind" = 'outdoor-point';--> statement-breakpoint
CREATE INDEX "campus_map_current_facts_schema_idx" ON "campus_map_current_facts" USING btree ("fact_schema_version");--> statement-breakpoint
CREATE UNIQUE INDEX "campus_map_fact_revisions_place_change_uq" ON "campus_map_fact_revisions" USING btree ("place_change_id");--> statement-breakpoint
CREATE INDEX "campus_map_fact_revisions_place_created_idx" ON "campus_map_fact_revisions" USING btree ("place_id","created_at","id");--> statement-breakpoint
CREATE INDEX "campus_map_fact_revisions_changeset_idx" ON "campus_map_fact_revisions" USING btree ("changeset_id");--> statement-breakpoint
CREATE INDEX "campus_map_fact_revisions_previous_idx" ON "campus_map_fact_revisions" USING btree ("place_id","previous_revision_id");--> statement-breakpoint
CREATE INDEX "campus_map_fact_revisions_schema_idx" ON "campus_map_fact_revisions" USING btree ("fact_schema_version");--> statement-breakpoint
CREATE INDEX "campus_map_fact_revisions_building_floor_idx" ON "campus_map_fact_revisions" USING btree ("building_id","floor_id");--> statement-breakpoint
CREATE INDEX "campus_map_fact_revisions_merge_target_idx" ON "campus_map_fact_revisions" USING btree ("merged_into_place_id");--> statement-breakpoint
CREATE INDEX "campus_map_fact_schemas_created_by_idx" ON "campus_map_fact_schemas" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "campus_map_fact_schemas_one_active_uq" ON "campus_map_fact_schemas" USING btree ("status") WHERE "campus_map_fact_schemas"."status" = 'active';--> statement-breakpoint
CREATE INDEX "campus_map_floor_provenance_source_idx" ON "campus_map_floor_provenance" USING btree ("provenance_id");--> statement-breakpoint
CREATE INDEX "campus_map_floors_building_sort_idx" ON "campus_map_floors" USING btree ("building_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "campus_map_place_changes_changeset_place_uq" ON "campus_map_place_changes" USING btree ("changeset_id","place_id");--> statement-breakpoint
CREATE INDEX "campus_map_place_changes_place_idx" ON "campus_map_place_changes" USING btree ("place_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campus_map_provenance_source_ref_uq" ON "campus_map_provenance_sources" USING btree ("source_kind","source_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "campus_map_provider_mappings_identity_uq" ON "campus_map_provider_mappings" USING btree ("provider","provider_object_id");--> statement-breakpoint
CREATE INDEX "campus_map_provider_mappings_building_idx" ON "campus_map_provider_mappings" USING btree ("building_id");--> statement-breakpoint
CREATE INDEX "campus_map_provider_mappings_place_idx" ON "campus_map_provider_mappings" USING btree ("place_id");--> statement-breakpoint
CREATE INDEX "campus_map_provider_mappings_provenance_idx" ON "campus_map_provider_mappings" USING btree ("provenance_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campus_map_publish_requests_actor_key_uq" ON "campus_map_publish_requests" USING btree ("actor_id_snapshot","idempotency_key");--> statement-breakpoint
CREATE INDEX "campus_map_publish_requests_changeset_idx" ON "campus_map_publish_requests" USING btree ("changeset_id");--> statement-breakpoint
CREATE INDEX "campus_map_publish_requests_actor_user_idx" ON "campus_map_publish_requests" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "campus_map_revision_provenance_source_idx" ON "campus_map_revision_provenance" USING btree ("provenance_id");--> statement-breakpoint
CREATE INDEX "campus_map_revision_visibility_updated_by_idx" ON "campus_map_revision_visibility" USING btree ("updated_by");