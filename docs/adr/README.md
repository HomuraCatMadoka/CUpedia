# Find an architectural decision

Architectural decision records (ADRs) explain why CUpedia accepted a durable boundary. Each number in this index is unique. Open the record itself for its status, decision, and recorded reasoning or consequences.

## ADR index

- [0001: Public reads with CUHK-gated accounts and writes](0001-public-read-cuhk-gated-write.md)
- [0002: Media lifecycle independent of page deletion](0002-media-lifecycle-independent-of-page.md)
- [0003: Enforce OTP eligibility in an authentication hook](0003-otp-whitelist-via-before-hook.md)
- [0004: Store the single Owner tier in site settings](0004-owner-tier-via-site-setting.md)
- [0005: Define Course Tree data provenance](0005-course-tree-data-provenance.md)
- [0006: Keep Course Tree an explorer, not a graduation auditor](0006-explorer-not-graduation-auditor.md)
- [0007: Name E2E specs by feature](0007-e2e-tests-named-by-feature.md)
- [0008: Merge Wiki conflicts at the Plate block level](0008-block-level-diff3-not-markdown-bridge.md)
- [0009: Coalesce consecutive Wiki revisions on write](0009-write-side-revision-coalescing.md)
- [0010: Keep the Wiki page tree and table of contents visible together](0010-coexist-nav-shell.md)
- [0011: Keep Wiki search in memory and remove unused trigram indexes](0011-in-memory-search-drop-dead-trgm-indexes.md)
- [0012: Share one Wiki edit-permission predicate with different freshness](0012-single-edit-permission-predicate-split-freshness.md)
- [0013: Keep canteen pricing options behind a stable API boundary](0013-canteen-pricing-api-boundary.md)
- [0014: Preserve dish identity and history during external menu sync](0014-canteen-external-menu-sync.md)
- [0015: Use native signup and in-context contributor completion](0015-native-signup-and-contributor-completion.md)
- [0016: Keep notification creation atomic and later lifecycle independent](0016-notification-source-lifecycle.md)
- [0017: Separate session drafts from server-authoritative conflicts](0017-session-drafts-and-server-authoritative-conflicts.md)
- [0018: Use permanent UUID routes for Notion-style Wiki pages](0018-notion-style-wiki-page-contract.md)
- [0019: Create new Wiki pages as private page drafts](0019-private-untitled-wiki-drafts.md)
- [0020: Build verified professor cards from canonical people](0020-verified-professor-cards-from-canonical-people.md)
- [0021: Let Campus Transport own operational stops](0021-campus-transport-owns-operational-stops.md)
- [0022: Rate-limit anonymous Campus Bus feedback with short sessions](0022-campus-bus-feedback-session-rate-limit.md)
- [0023: Hard-delete canteen records and support development mock mode](0023-canteen-hard-delete-and-mock-mode.md)
- [0024: Allow anonymous canteen votes](0024-canteen-anonymous-vote-only.md)
- [0025: Separate menu synchronization from ordering handoff](0025-separate-menu-sync-from-ordering-handoff.md)
- [0026: Refresh current menus across provider publication windows](0026-refresh-current-menus-across-provider-publication-windows.md)
- [0027: Use iCHEF setting-item UUIDs as product identity](0027-ichef-setting-item-identity.md)
- [0028: Use Supabase Cron as the primary menu-sync clock](0028-use-supabase-cron-as-primary-menu-sync-clock.md)
- [0029: Bound Supabase pg_net transport evidence](0029-bound-supabase-pg-net-transport-evidence.md)
- [0030: Stop scoped observations at bounded refresh horizons](0030-stop-scoped-observations-at-refresh-horizons.md)
- [0031: Separate canonical dishes from provider offerings](0031-separate-canonical-dishes-from-provider-offerings.md)
- [0032: Audit canonical dish identity evolution](0032-audit-canonical-dish-identity-evolution.md)
- [0033: Materialize professor portraits as owned assets](0033-materialize-professor-portraits-as-owned-assets.md)
- [0034: Separate Campus Map canonical facts from providers and presentation](0034-campus-map-provider-neutral-place-facts.md)
- [0035: Publish Campus Map facts with direct changesets](0035-campus-map-direct-changesets.md)
- [0036: Model Campus Map ratings and reviews as one current Place feedback](0036-model-campus-map-place-feedback-as-one-current-submission.md)

## Maintain the index

This index was introduced with a one-time repair of three legacy number collisions. From this baseline onward, assign the next unused number when adding a decision. Add the record and this index in the same change. Preserve the number and content of a committed ADR; record a replacement in a new ADR and mark the older record as superseded.
