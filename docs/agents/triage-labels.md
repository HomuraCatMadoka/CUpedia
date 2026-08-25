# Map agent triage states to GitHub labels

Use only labels that exist in `HomuraCatMadoka/CUpedia`. The repository does not currently have `needs-triage` or `needs-info` labels, so those states use the absence of a readiness label plus a clear issue comment.

Last verified: 2026-08-25

| Triage state      | Repository action                                                | Meaning                                                                |
| ----------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Needs triage      | Leave readiness labels absent                                    | A maintainer still needs to evaluate scope and priority                |
| Needs information | Leave readiness labels absent and comment with the missing facts | Work cannot be specified from the current issue                        |
| Ready for agent   | Add `ready-for-agent`                                            | The issue has bounded scope and objective acceptance criteria          |
| Ready for human   | Add `ready-for-human`                                            | The task requires human judgment or access that an agent cannot supply |
| Will not fix      | Add `wontfix` and close with a reason                            | The repository will not pursue the issue                               |

Verify current labels before mutating an issue:

```bash
gh label list --limit 200
```

Remove a stale readiness label when the issue returns to triage or needs more information. Apply at most one readiness label.
