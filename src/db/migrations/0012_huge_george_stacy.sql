DROP INDEX "course_ratings_course_code_idx";--> statement-breakpoint
-- Collapse pre-existing multi-row ratings to one vote per (course, user):
-- keep each user's most recent rating, drop the older duplicates, so the
-- unique index below can be created. (Hand-written: not derivable from schema.)
DELETE FROM "course_ratings" a
USING "course_ratings" b
WHERE a."course_code" = b."course_code"
  AND a."user_id" = b."user_id"
  AND (a."created_at", a."id") < (b."created_at", b."id");--> statement-breakpoint
CREATE UNIQUE INDEX "course_ratings_course_user_uq" ON "course_ratings" USING btree ("course_code","user_id");