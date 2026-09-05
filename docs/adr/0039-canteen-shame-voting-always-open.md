# ADR 0039: Keep canteen shame voting permanently open

## Status

Accepted

## Context

The daily canteen shame rank was originally controlled by an administrator-managed end date. The product now needs the rank to remain usable indefinitely, while preserving its daily ranking and abuse-prevention rules.

## Decision

1. Canteen shame voting has no end date and remains open for every Hong Kong calendar date.
2. The `site_settings.canteen_shame_vote_end_date` setting and its admin UI are no longer part of the feature. Existing rows for this legacy key may remain unused.
3. Append-only storage, Hong Kong-date aggregation, the anonymous cookie boundary, the per-minute rate limit, and the anonymous daily cap from [ADR 0024](./0024-canteen-anonymous-vote-only.md) remain unchanged.

## Consequences

- The rank page always enables its stomp buttons and describes voting as permanently open.
- There is no admin action or deployment setting that can close this vote path.
- ADR 0024 decision 8 is superseded; its other decisions continue to define anonymous canteen voting.
