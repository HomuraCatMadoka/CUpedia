# Course Reviews API

Course identifiers in paths accept either a UUID `courses.id` or normalized course code such as `CSCI2100`.

## `GET /api/courses/{courseId}`

Returns course metadata, aggregate review statistics, and the newest 20 reviews.

Response `200`:

```json
{
  "course": {
    "id": "uuid",
    "code": "CSCI2100",
    "title": "Data Structures",
    "department": "CSCI",
    "credits": 3,
    "description": ""
  },
  "aggregate": {
    "reviewCount": 1,
    "averageRating": 4.5,
    "averageDifficulty": 3.5,
    "averageWorkload": 4,
    "averageGrading": 3
  },
  "reviews": [
    {
      "id": "uuid",
      "rating": 4.5,
      "difficulty": 3.5,
      "workload": 4,
      "grading": 3,
      "content": "Useful but busy.",
      "term": "2025 Fall",
      "instructor": "Prof. Chan",
      "anonymous": false,
      "helpfulScore": 0,
      "createdAt": "2026-06-10T15:00:00.000Z",
      "user": { "id": "uuid", "nickname": "Alice" }
    }
  ]
}
```

Errors: `404` when the course does not exist.

## `POST /api/courses/{courseId}/reviews`

Requires an authenticated, non-banned user. Creates one review and refreshes `course_aggregates` in the same transaction.

Request:

```json
{
  "rating": 4.5,
  "difficulty": 3.5,
  "workload": 4,
  "grading": 3,
  "content": "Useful but busy.",
  "term": "2025 Fall",
  "instructor": "Prof. Chan",
  "anonymous": false
}
```

Rules:

- `rating`, `difficulty`, `workload`, and `grading` must be from 0.5 to 5 in 0.5 increments.
- `content` must be non-empty after trimming.
- A user may have one review per course.

Response `201`:

```json
{ "id": "review-uuid" }
```

Errors: `400` validation failure, `401` unauthenticated, `404` missing course, `409` duplicate review by the same user for the same course.

## `POST /api/reviews/{reviewId}/vote`

Requires an authenticated, non-banned user. Upserts the caller's vote and updates the review `helpfulScore`.

Request:

```json
{ "value": 1 }
```

`value` must be `1` for helpful or `-1` for not helpful. Repeating the same vote is idempotent.

Response `200`:

```json
{ "helpfulScoreDelta": 1 }
```

Errors: `400` invalid value, `401` unauthenticated, `404` missing review.
