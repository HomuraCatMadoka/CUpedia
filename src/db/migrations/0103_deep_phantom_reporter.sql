ALTER TABLE "campus_map_publish_requests" DROP CONSTRAINT "campus_map_publish_requests_result_check";--> statement-breakpoint
ALTER TABLE "campus_map_publish_requests" ADD COLUMN "result" jsonb;--> statement-breakpoint
ALTER TABLE "campus_map_publish_requests" ADD CONSTRAINT "campus_map_publish_requests_result_check" CHECK ((
        "campus_map_publish_requests"."status" = 'processing'
        and "campus_map_publish_requests"."changeset_id" is null
        and "campus_map_publish_requests"."result" is null
        and "campus_map_publish_requests"."completed_at" is null
      ) or (
        "campus_map_publish_requests"."status" = 'published'
        and "campus_map_publish_requests"."changeset_id" is not null
        and "campus_map_publish_requests"."result" is not null
        and "campus_map_publish_requests"."completed_at" is not null
      ));