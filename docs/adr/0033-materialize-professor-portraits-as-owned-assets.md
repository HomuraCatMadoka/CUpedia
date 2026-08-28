# ADR 0033: Materialize professor portraits as owned assets

## Status

Accepted

## Context

ADR 0020 kept professor portraits as external URLs. The professor directory
then rendered those URLs through Next.js Image Optimization. One source image
could create several Vercel transformations for different widths and formats,
and crawlers or cold cache variants could repeat that work. The free team's
5,000 monthly transformations were exhausted even though the logical portrait
set is only about 1,661 people.

The source URL remains useful provenance, but a third-party site is not a
reliable or economical delivery layer for a frequently viewed directory.

## Decision

1. `staff_person_sources.image_url` remains source provenance. A separate
   `professor_portrait_assets` row records the latest attempted source
   fingerprint separately from the last successfully materialized fingerprint
   and owned objects for each canonical person.
2. A bounded operator command selects the same verified department source used
   by the card, then the current Research Portal image as fallback. It validates
   every initial and redirected URL against the CUHK/CDN allowlist, caps the
   response Content-Type, download size and redirect count, checks the actual
   file signature, and reports per-person failures without stopping the whole
   batch. Downloads are streamed through a hard byte limit rather than buffered
   before validation.
3. Each successful source becomes square 256px and 384px WebP variants in the
   existing S3-compatible object store. Keys include a hash of the transformed
   WebP output and objects use a one-year immutable cache policy. Every sync
   revalidates the selected source with ETag/Last-Modified when available, or
   compares transformed content when validators are absent. Unchanged content
   does not write new objects.
4. `pending`, `ready`, and `failed` describe the latest attempt. A failed
   refresh changes only the attempt fields and does not clear or advance the
   last-successful fingerprint and keys, so a temporary source outage does not
   break an existing portrait or prevent a later retry.
5. Professor pages receive only owned public URLs and dimensions. They render a
   native `img` with `srcset`; they do not use `next/image`, the Vercel Image
   Optimization endpoint, or a browser fallback to the remote source. A missing
   or failed owned image uses the professor's initials.
6. Materialization is an explicit operator action, not part of `vercel-build`.
   Schema deployment and code deployment therefore do not unexpectedly fetch
   external sites or write production object storage. Production rollout must
   run the dry-run first, then the bounded materialization command with the
   intended credentials.

This decision supersedes only ADR 0020's portrait storage and delivery clause.
Its identity, source verification, profile-link, ordering, rating, evidence and
import decisions remain accepted.

## Consequences

- Normal professor traffic reads immutable files from CUpedia's object storage
  and creates no Vercel image transformations.
- Storage is predictable: two small WebP files per successfully materialized
  professor, while remote originals are not retained.
- A source change requires the operator command (or a future scheduled caller)
  before users see the new portrait.
- Old content-addressed objects are deliberately not deleted during refresh.
  Safe garbage collection can be added later by comparing object keys with the
  asset table and applying a retention window.
- A newly deployed empty asset table initially shows initials. The production
  backfill is a separate, observable rollout step.
