# Work with Wiki data

This guide explains the persistence boundaries that Wiki changes must preserve. The linked architectural decision records (ADRs) remain authoritative for the reasons behind each boundary.

## Keep identity separate from presentation

A Wiki page uses one permanent UUID. `/wiki/page_uuid` is its public reading and editing route, while `/wiki/history/page_uuid` shows history. A title, icon, or parent can change without changing identity or creating a slug redirect.

[ADR 0018](../adr/0018-notion-style-wiki-page-contract.md) defines the UUID page contract.

## Keep new pages as private page drafts until publication

The browser creates a stable UUID when a contributor starts a page. The page begins in `wiki_drafts`, remains visible only to its owner, and autosaves on the server. Publishing validates the title and parent, creates the public page and first revision in one transaction, updates link data, and removes the private page draft.

Private page drafts do not appear in anonymous reads, the public tree, search, history, backlinks, or discussions. [ADR 0019](../adr/0019-private-untitled-wiki-drafts.md) supersedes ADR 0018's original public-blank-page creation timing.

Use these write boundaries:

- `src/lib/wiki-draft-actions.ts` owns private page draft mutations and publication
- `src/lib/wiki-actions.ts` owns public page edits, hierarchy, revisions, deletion, restore, and rollback
- `src/lib/auth-guard.ts` enforces the current editor policy on the server

## Store Plate JSON as the canonical content

Wiki content is stored as Plate JSON, not Markdown or HTML. `src/lib/plate-utils.ts` is the conversion boundary:

- `parseContent` reads stored JSON and safely degrades legacy non-JSON input
- `extractText` produces search and excerpt text
- `fromMarkdown` imports Markdown into Plate nodes
- `toMarkdown` produces Markdown for explicit presentation or compatibility paths

Markdown does not represent every Plate node without loss. Keep merging and persistence in the Plate document model; [ADR 0008](../adr/0008-block-level-diff3-not-markdown-bridge.md) records the block-level conflict strategy.

## Preserve conflict and revision semantics

Ordinary writes use a version compare-and-swap. Rollback and deletion also change `contentGeneration`, which prevents an older local draft from silently merging into a replaced generation. Non-overlapping edits in the same generation may use the Plate block-level three-way merge.

IndexedDB stores a browser recovery copy, while the public page or private page draft remains authoritative. [ADR 0017](../adr/0017-session-drafts-and-server-authoritative-conflicts.md) defines the recovery and conflict states.

Public revisions preserve edit history. Consecutive writes by one author may coalesce under the rule in [ADR 0009](../adr/0009-write-side-revision-coalescing.md); rollback creates a new revision instead of rewriting history.

## Search public pages in memory

Wiki search loads searchable public-page text into a cache. `src/lib/search.ts` tries case-insensitive exact title or content matches first and uses Fuse for fuzzy fallback only when no exact match exists. PostgreSQL trigram and Chinese full-text indexes are not part of the current Wiki search read path.

[ADR 0011](../adr/0011-in-memory-search-drop-dead-trgm-indexes.md) defines this boundary and its scale trigger.

## Serve Wiki assets as public media

Uploads use S3-compatible storage through `src/lib/minio.ts`. Application content references `/api/wiki-assets/wiki-assets/object_uuid.png`; the route validates the key, streams the object, and adds immutable public cache headers.

Wiki assets are anonymous public media and outlive page deletion. Describe the proxy as a validation and caching boundary, not a privacy or authorization boundary. [ADR 0002](../adr/0002-media-lifecycle-independent-of-page.md) defines the independent media lifecycle.
