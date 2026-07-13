-- #293 changes the public recommendation index from 0–10 to 0.5–5 stars.
-- Scale every legacy vote by the same factor so ordering and aggregates are
-- preserved exactly. Offering metadata remains NULL because it cannot be
-- reconstructed reliably for historical votes.
UPDATE "course_ratings" SET "score" = "score" / 2;
