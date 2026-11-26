INSERT INTO "achievement_profiles" ("user_id")
SELECT DISTINCT "user_id"
FROM "course_reviews"
WHERE NOT "is_anonymous"
ON CONFLICT ("user_id") DO NOTHING;
