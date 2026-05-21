# Skills

On-demand context files loaded when relevant. They extend `AGENTS.md` with step-by-step workflows and verification steps.

## When to Create a Skill

Create a skill when content is:

- Too detailed for AGENTS.md (multi-step workflows, code templates)
- Only relevant for specific tasks
- Self-contained enough to load independently

Keep in AGENTS.md instead for one-liner rules every session needs.

## File Structure

```
.agents/skills/
├── my-skill/
│   └── SKILL.md          # Required: frontmatter + content
│   └── workflow.md        # Optional: supplementary files
└── README.md              # This file
```

## SKILL.md Format

```yaml
---
name: my-skill
description: >
  What this skill covers and when to use it. Include key file names,
  concepts, and trigger phrases for auto-activation.
---
```

### Relationship to AGENTS.md

AGENTS.md holds always-loaded guardrails. Skills hold deep-dive content loaded on demand. AGENTS.md points to skills via `$skill-name` references.
