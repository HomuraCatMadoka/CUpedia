# Phase-tracker renumbering ops (TASK.md style)

Operational detail for the terse renumber/delete ops users issue on phase-tracking docs.
SKILL.md's "Drop / fold phases" section points here for the exact edit checklist.

## Delete + successor renumber ("phase 12 delete. phase 12A -> 12")

1. Delete the old phase section entirely.
2. Give the successor the freed number:
   - Heading: `## Phase 12A: 终期报告 ✅` → `## Phase 12: 终期报告 ✅`
   - Item IDs: `12A.1` → `12.1` ... `12A.5` → `12.5`
3. **Sweep the WHOLE doc for cross-references to the deleted phase's name in
   unrelated sections.** Real case: a correction note in Phase 9.5 cited
   "Phase 12 诚实性说明" — that section vanished with the deleted phase.
   Fix by inlining the key numbers or re-pointing:
   `→ "见 Phase 11 重要更正（正确加载后 F1 +2.0pp, recall +2.2pp, precision +1.1pp）"`
4. Verify: `grep -n "Phase 12\|12A" TASK.md` — expect zero matches (exit 1).
   Eyeball every remaining hit for old numbering before committing.

## Sub-item renumbering ("5A.X -> 5.1.X; 5B.X -> 5.2.X")

- Renumber BOTH the sub-phase header cells (`**5A** 原始管线` → `**5.1**`) AND
  the item IDs (`5A.1` → `5.1.1`, `5B.6` → `5.2.6`).
- Do NOT touch real filenames that share the prefix: `test_integration_5a.py`
  is a disk artifact, not a doc ID — leaving it is correct, and its lowercase
  `5a` never collides with `5A.` patterns anyway.

## Terse-op hygiene (from the same session)

- "标记已完成" for a phase whose feature was never implemented → verify first
  (`search_files` for the module/endpoint); user has zero tolerance for
  fabricated ✅. Offer: honest close note (no ✅) / implement then mark / accept
  mismatch. Default: honest close.
- "10A -> 4" (fold) → subsection `### 4.11` of the target phase, item IDs
  `10A.1` → `4.11.1`, update principle references, remove from progress bar.
- Deleting the progress-bar header or `[优先级 N]` markers is a plain
  `patch` removal — grep after to confirm zero residuals.
