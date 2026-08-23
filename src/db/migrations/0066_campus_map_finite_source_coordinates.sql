ALTER TABLE "campus_map_provenance_sources" DROP CONSTRAINT "campus_map_provenance_coordinate_lineage_check";--> statement-breakpoint
ALTER TABLE "campus_map_provenance_sources" ADD CONSTRAINT "campus_map_provenance_coordinate_lineage_check" CHECK ((
        "campus_map_provenance_sources"."source_coordinate_x" is null
        and "campus_map_provenance_sources"."source_coordinate_y" is null
        and "campus_map_provenance_sources"."source_coordinate_crs" is null
        and "campus_map_provenance_sources"."conversion_method" is null
        and "campus_map_provenance_sources"."conversion_version" is null
      ) or (
        "campus_map_provenance_sources"."source_coordinate_x" is not null
        and "campus_map_provenance_sources"."source_coordinate_y" is not null
        and "campus_map_provenance_sources"."source_coordinate_x" not in (
          'NaN'::double precision,
          'Infinity'::double precision,
          '-Infinity'::double precision
        )
        and "campus_map_provenance_sources"."source_coordinate_y" not in (
          'NaN'::double precision,
          'Infinity'::double precision,
          '-Infinity'::double precision
        )
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
      ));