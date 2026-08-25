# Load domain documentation before changing behavior

Use this routing rule when a task changes business behavior, ownership, terminology, or a boundary between products. `CONTEXT-MAP.md` is the only context list; this page does not duplicate it.

## Read the domain path

1. Open the root [`CONTEXT-MAP.md`](../../CONTEXT-MAP.md).
2. Open every `CONTEXT.md` linked for the affected domains.
3. Use the domain's defined terms in issues, tests, code, and review notes.
4. Open the relevant record in the [ADR index](../adr/README.md) before changing an accepted boundary.
5. Compare the requested behavior with the current code and schema before implementation.

The context documents define language, ownership, and invariants. They do not replace implementation inspection.

## Handle gaps and conflicts

If a required term or boundary is absent, identify the gap before inventing vocabulary. If the requested change contradicts an ADR, state the conflict and decide whether the task needs a new superseding ADR.

Update the context map when adding or removing a bounded context. Update only the owning `CONTEXT.md` when changing one domain's language; keep the map as navigation and relationships rather than a second glossary.
