# Find the right CUpedia document

This page is a directory-level map, not an inventory of every artifact. Start with the reader task below, then follow the linked index or folder. Code and configuration remain authoritative for current runtime behavior.

## Start by task

| Task                                               | Start here                                                                  |
| -------------------------------------------------- | --------------------------------------------------------------------------- |
| Set up local development                           | [Development setup](development/setup.md)                                   |
| Change the database                                | [Database workflow](development/database.md)                                |
| Choose tests or understand CI                      | [Testing guide](development/testing.md), then [CI topology](ci-topology.md) |
| Change Wiki persistence, drafts, search, or assets | [Wiki data guide](development/wiki.md)                                      |
| Change domain behavior or terminology              | [Context map](../CONTEXT-MAP.md), then the relevant `CONTEXT.md`            |
| Understand an architectural decision               | [ADR index](adr/README.md)                                                  |
| Operate a deployed integration                     | `operations/`; verify the status header and executable source               |
| Triage an issue or prepare agent work              | `agents/`                                                                   |

The root [contribution guide](../CONTRIBUTING.md) covers the fork, branch, commit, and pull-request workflow. The root [agent guide](../AGENTS.md) keeps only rules that apply on every coding-agent task.

## Domain language and boundaries

[CONTEXT-MAP.md](../CONTEXT-MAP.md) is the only list of bounded contexts and their relationships. Each linked `CONTEXT.md` defines one domain's preferred terms, ownership, and boundaries without duplicating implementation details.

## Decisions and contracts

- `adr/` stores architectural decision records. Use the [ADR index](adr/README.md) to find a unique identifier and open the record for its status and reasoning.
- `contracts/` stores versioned machine or integration contracts. Treat a contract as normative only for the version named by the caller or operation.

An ADR explains why the project accepted a boundary; current code and schema show how that boundary is implemented now.

## Operations and current topology

`operations/` contains deployed runbooks and transition procedures. Prefer a file marked `Status: Current`; follow its `Superseded by` link when present. When a file has no status header, verify it against the workflow, script, route, or configuration that performs the operation.

[CI topology](ci-topology.md) records the current risk classifier, hosted jobs, and required gate. `.github/workflows/ci.yml` and `scripts/ci-classifier.mjs` remain the executable source of truth.

## Research, data, and evidence

Research and captured evidence inform later decisions but do not automatically describe current production behavior:

- `campus-bus/` contains the reviewed stop-code registry and test-coverage handoff for the current Campus Bus implementation; source and tests remain authoritative
- `campus-transport/research/` contains source, map, schedule, and arrival-model investigations
- `campus-transport/data/` contains provenance, snapshots, schedules, and geodata; some files are runtime inputs despite living under `docs/`
- `canteen/` contains provider research, examples, and historical lessons beside its domain context
- Root research files such as `cuhk-qr-ordering-research.md` and `ichef-guest-ordering.md` are snapshots of a question at the time recorded

Open the relevant ADR, contract, operation, code, or schema before treating a research conclusion as a current rule.

## Historical documents

Files marked `Status: Historical` describe a superseded choice and point to the current source with `Superseded by`. For example, the [early canteen scheduling comparison](canteen-menu-sync-scheduling.md) now routes readers to the production runbook.

## Plans, prototypes, and screenshots

`plans/`, `prototypes/`, and `screenshots/` are design or review artifacts. They support discussion and visual comparison; they are not promises that a feature shipped unchanged.

## Status metadata

Time-sensitive operation and research documents can use this header directly below the title:

```text
Status: Current | Proposed | Research snapshot | Historical | Superseded
Last verified: YYYY-MM-DD
Superseded by: relative-link-if-applicable
```

`Last verified` records a check against the named source, not merely an edit date. Files without a status header must be interpreted from their purpose, date, and linked current sources.
