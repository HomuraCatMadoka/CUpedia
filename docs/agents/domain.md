# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — permissions, roles, and access-control vocabulary (User, Admin, 站长/Owner, Editor mode, etc.)
- **`docs/course-tree/CONTEXT.md`** — course-tree feature terminology (when working in that area)
- **`docs/adr/`** — read ADRs that touch the area you're about to work in

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The producer skill (`/grill-with-docs`) creates them lazily when terms or decisions actually get resolved.

## File structure

Single-context repo with one feature-scoped supplement:

```
/
├── CONTEXT.md                         ← global domain language (auth, wiki, permissions)
├── docs/
│   ├── adr/                           ← architectural decisions (0001–0006)
│   │   ├── 0001-public-read-cuhk-gated-write.md
│   │   ├── 0002-media-lifecycle-independent-of-page.md
│   │   └── ...
│   ├── course-tree/
│   │   └── CONTEXT.md                 ← course-tree feature vocabulary
│   └── agents/                        ← agent skill configuration (this directory)
└── src/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/grill-with-docs`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0004 (owner-tier-via-site-setting) — but worth reopening because…_
