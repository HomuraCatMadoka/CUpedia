---
name: repo-documentation
description: "Structure project repo documentation: AGENTS.md (AI constraints) vs README.md (human guide), CLAUDE.md mirror, .gitignore hygiene, doc conventions."
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [documentation, repo-structure, README, AGENTS, CLAUDE, gitignore]
---

# Repo Documentation Structure

Guidelines for setting up and maintaining a project repository's documentation files, dividing responsibilities between AI-facing config and human-facing docs.

## When to Use

- Setting up a new repo from scratch
- Reorganizing an existing repo's root docs
- User asks about AGENTS.md / README.md / CLAUDE.md roles
- Cleaning up tracked files that should be gitignored

## Core Convention

Every project repo should carry three root-level documentation files with distinct responsibilities:

| File | Audience | Content |
|------|----------|---------|
| `README.md` | **Humans** (newcomers, colleagues, users) | Project overview, tracks/topics, tech stack, directory structure, gitignore notes, quick-start |
| `AGENTS.md` | **AI agents** (Codex, Cursor, etc.) | Constraints and conventions only: code style, testing standards, domain-specific rules (e.g., quant finance conventions) |
| `CLAUDE.md` | **Claude Code** | Mirror of AGENTS.md for Claude Code compatibility (same body, different preamble) |

### Responsibility Boundary

- **AGENTS.md** = what agents MUST do / MUST NOT do. Rules, not descriptions.
- **README.md** = what humans need to know to use the repo. Descriptions, not rules.

## Progressive Gitignore Hygiene

When cleaning up a repo, you will discover what should be ignored incrementally. Work through this sequence:

1. **Check what's in the working tree** — `ls -la` at root
2. **Check what's tracked** — `git ls-files | grep -E '\.(pdf|zip|key|duckdb|csv\.zip)$'`
3. **Add patterns to .gitignore** — one commit per category with a clear comment header
4. **Untrack affected files** — `git rm --cached <file>` for each pattern
5. **Remove actual files** only if the user explicitly asks (e.g., archives, temp files)

Common gitignore patterns for quant/student repos:

```
# Official lecture PDFs (external source material, not student work)
lecture-pdfs/

# All PDFs — external source material, not code
*.pdf

# Archives and binaries
*.zip
*.key
```

## Phase-tracking docs (TASK.md style): honest status + unified rewrite

Research repos often carry an ALL-CAPS phase tracker (e.g. `TASK.md`). Two rules govern edits to it:

**Verify before marking ✅.** When the user says "mark phase X complete", check the artifact actually exists first: `search_files` for the named module/endpoint, `git log` for the work, run the test suite. If the feature was never implemented, do NOT write ✅ — the user has zero tolerance for fabricated records. Present the discrepancy and offer options via clarify: (a) close the entry with an honest scope note (no ✅, "未纳入范围,条目已关闭"), (b) implement it first, then mark complete, (c) accept a record/code mismatch. Default to (a).

**Unified-rewrite recipe (用户要求"统一格式、减少啰嗦"时):**
- One template per phase: `## Phase N: 标题 ✅` → `**Goal:**` one line → `| # | Item | Status |` table. Convert scattered checkbox lists into tables; give each results section a `**结论:**` one-liner in Chinese replacing multi-paragraph English key-findings.
- Fix structural rot: duplicate section numbers (two "Phase 10" → renumber one to `10A`, leave the progress bar untouched), misplaced subsections (e.g. `9.7` stranded after a "Results Summary"), and a section duplicated with its own summary (merge "Phase 9" + "Phase 9 Results Summary", delete the repeated tables).
- Remove dangling references to files deleted during repo cleanup (`docs/design/*`, `paper/references.bib` → rewrite as "现位于 `report/`"); keep references to surviving paths.
- Preserve ALL numbers: after rewriting, grep spot-check the key values (accuracies, AUROC, IoU, F1, param counts) against the original.
- Keep honesty records verbatim in compressed form: correction notes (e.g. checkpoint-loading artifacts), "诚实性说明" caveats, "重要更正" blocks — compress prose, never the caveats themselves.
- Run `pytest -q 2>&1 | tail -3` for the real test count; a stale count in another doc (AGENTS.md said 885, actual was 942) is not evidence.

**Localize to Chinese on request (全篇用中文):** When the user asks for full-Chinese, translate narrative and table headers, keep technical identifiers verbatim. Safe bulk replacements (patch replace_all): `| # | Item | Status |` → `| # | 条目 | 状态 |`, `**Goal:**` → `**目标:**`, `**Script:**` → `**脚本:**`, `**Model:**` → `**模型:**`, `| Metric |` → `| 指标 |`, `Before`/`After` → `修正前`/`修正后`, `mean ± std` → `均值 ± 标准差`, `Stretch Goals` → `延伸目标`, `Web Demo` → `网页演示`, `Poster` → `海报`, `Final Report` → `终期报告`, `Research —` → `研究 —`. Keep English only for: class/function/file paths, metric names (Precision, Recall, AUROC, IoU, MSE), model names (Qwen, DINOv2, vit_tiny), library names. Numbers must not change. After the pass, grep for residual English and eyeball each hit — most remaining matches should be identifiers, not prose.

**Drop / fold phases (user gives terse ops like "phase 8去掉", "10A -> 4"):**
- *Drop a phase*: delete its section, remove the number from the progress-bar chain (`P1→…→P8→P9` → `P1→…→P7→P9`), and fix cross-references in other phases (e.g. Phase 9's goal "验证 Phase 7/8 结论" → "验证 Phase 7 结论"). Do NOT renumber later phases — the numbering is historical record.
- *Fold a phase into another*: `## Phase 10A: …` → `### 4.11 …` as a numbered subsection of the target phase, move it physically inside that phase, renumber item IDs (`10A.1` → `4.11.1`), and update `执行原则`/principle references. Folded phases vanish from the progress bar (it lists top-level phases only).

**Bilingual README split (中英文分开两个文档写):** When a README mixes EN + ZH paragraphs and the user asks to split ("中英文分开两个文档写。在文件开头互相链接引用"), produce two full documents:
- `README.md` — English; `README.zh-CN.md` — Chinese (GitHub renders both as top-level files).
- Top of each file, language switch line: `**English** | [简体中文](README.zh-CN.md)` and `**简体中文** | [English](README.md)` respectively.
- Translate EVERYTHING including mermaid node labels (flowchart node text with Chinese + `<br/>` parses fine — verify with `mermaid.parse()` via a temp HTML + CDN, per the `mermaid-diagrams` skill). Table headers and prose fully localized; bibtex/code/URLs identical in both.
- Keep the two files content-equivalent; the English file stays the canonical default (GitHub shows README.md on the repo page).

**AGENTS.md post-completion refresh:** After a project's phases finish, AGENTS.md rots silently. Sweep it for: stale phase status ("Remaining: Phase X" → all complete + real test count from `pytest`), outdated model descriptions (e.g. "3 prediction heads" → actual head count), stale dataset claims (replace planned datasets with the ones experiments actually used), dead install commands, and superseded architecture diagrams (Δ𝐱-only → multi-head pipeline). Also dedupe: repeated sections (identical delegate-task rules pasted under two headings) collapse to one, keeping numbering contiguous.

**Markdown math delimiters in repo docs (用户偏好):** narrative docs that carry formulas use LaTeX math delimiters — `$...$` for inline symbols ($\mathbf{b}_i$, $S_j \subseteq \{1,\dots,N\}$), `$$...$$` for standalone display formulas (hop equations, loss definitions) on their own line. User explicitly approved both ("公式用$包裹" then "allow $$"). When localizing or writing a report.md/README math section: convert plain-text formulas (`h_cj^(1) = sigma(W_1 · MEAN(...)`) to LaTeX (`$$\mathbf{h}_{c_j}^{(1)} = \sigma\!\left(\mathbf{W}_1 \cdot \operatorname{MEAN}\!\left(\left\{\mathbf{h}_{e_i}^{(0)} : (e_i, c_j) \in \mathcal{E}_{\text{edge}}\right\}\right) + \mathbf{b}_1\right),$$`), keep numbers untouched, and use the same symbol conventions as the source `main.tex` (mathcal sets, boldsymbol for vectors). GitHub renders both `$` and `$$` (MathJax/KaTeX). Related: `markdown-math` skill for KaTeX pitfalls.

**LaTeX source file named after the document ("set file name report as default"):** name the source `report.tex` (not `main.tex`) so the build output defaults to `report.pdf` — users of the repo find the PDF by the same stem. When renaming: `git mv main.tex report.tex`, update dangling references in other docs (TASK.md `report/main.tex` → `report/report.tex`), delete the stale `main.*` build artifacts locally (aux/bbl/blg/log/out/pdf/toc), recompile to verify, and add xelatex intermediates to .gitignore (`*.xdv` joins `*.aux/*.bbl/*.fdb_latexmk/*.fls/*.out/*.log/*.pdf`). Note `git add` from inside the subdir needs the RELATIVE path (`git add report.tex`, not `report/report.tex` — the latter fails with "pathspec did not match"). Verify a LaTeX change with `latexmk -xelatex -interaction=nonstopmode` (report uses xelatex for fontspec; poster uses lualatex — check which engine each doc needs).

**Figure-data provenance ("这个图的数据是哪来的"):** when the user questions a figure's numbers, trace the data instead of guessing. Recipe: (1) find the hardcoded values in the .tex (poster figures often bake counts into a `\foreach`); (2) locate the per-image JSON in `experiments/vlm_completion/*.json` (`pipeline_per_image.json` = 200 images with n_gt/n_pred/tp/fp/fn; `per_image_results.json` = only 32 — check `len` before trusting); (3) AGGREGATE the JSON and compare to the report's totals — if GT/VLM/FN/TP/FP all match (4789/2947/3663/1126/1821), it is the authoritative source; (4) recompute the figure's buckets and compare to the hardcoded values; (5) if they do not match exactly, say so plainly and distinguish measurement 口径 (e.g. matching-failure rate fn/n_gt ≈ 76.5% vs not-detected rate 1−2947/4789 ≈ 38% — same underlying data, different semantics), then offer to regenerate the figure from the reproducible JSON. **For scatter points hardcoded with per-axis scale factors (`at ({x*sx},{y*sy})`), divide each coordinate by its factor to recover the raw (x,y) pairs, sort, and diff against the JSON's per-image fields; recompute Pearson r from the JSON to confirm the in-figure r label.** When the user approves regeneration, replace the `\foreach` values with the computed buckets and add a source comment citing the JSON + 口径 (e.g. bars 4/12/36/54/94 → recomputed [4,12,31,59,94] from `pipeline_per_image.json`; constraint bars 37.3/…/15.1 verified exactly against `ablation_results.json` `avg_constraints_per_graph`; scatter 32 points verified point-by-point + r=0.9604 vs `per_image_results.json`). Never claim a number is verified when the repo cannot reproduce it. Full session detail in `references/figure-data-provenance.md`.

**Poster figure → report.tex porting (poster图移植):** when the user says "poster中有一个图…在report.tex适当位置也插入", port the TikZ instead of screenshotting:
- Locate the figure in `poster/poster.tex` by grepping its visible text labels (`grep -n 'Recipe\|misalignment'`), copy the `tikzpicture` block.
- Replace brand colors with standard ones matching the report's existing figures: `cuhk-purple` → `blue!60` (control/highlight) or `violet!80!black`, `cuhk-orange!N` → `orange!N` / `gray!50`; keep red/green error annotations. Group repeated dots with `\foreach`.
- Keep absolute coordinates and per-coordinate scale factors; add `\resizebox{\textwidth}{!}{%...}` only when raw width exceeds the text block.
- Placement by content, not poster position: failure-mode demo → end of §1.2 (where those failure modes are defined); ablation-adjacent bar chart → §4.3 right after the table it quantifies; correlation scatter → §4.2 end. Figures auto-renumber via `\ref` — never hardcode numbers.
- **Restraint rule (用户提醒: 前言后语不过度自如):** the leading sentence is ONE line that only points at / quantifies what the figure shows — never expand into interpretation or implications (Discussion's job). Caption stays factual (what + dataset + n + fit params), no editorializing. If prose already claims the effect (e.g. "far fewer constraints per graph"), the lead-in just says the figure quantifies the table.
- Verify data provenance BEFORE inserting: hardcoded `\foreach` points / bar values must reproduce from `experiments/*.json` (recompute r, bucket counts, per-point equality — see figure-data-provenance above). Reproducible → state it; not → flag it and offer regeneration.
- Compile-check from `report/`: `latexmk -xelatex -interaction=nonstopmode report.tex`, grep log for `^!`, then confirm rendering via `pdftotext report.pdf - | grep -c '<axis label>'`.

**Markdown report mirror of main.tex (report.md 与 main.tex 同步):** when asked "update report.md based on main.tex", the .tex is authoritative — diff and copy: numbers verbatim (e.g. stale "10–30%" omission → tex's 38%, with the 2947/4789 breakdown), experiment section ORDER (tex may move end-to-end before ablations), missing tables (tabularx → markdown), and a divergent/truncated abstract. `sed -n 'Np'` to read long lines the reader truncates.

## Pitfalls

- **AGENTS.md 通用工作流禁止硬编码具体项目名/产品名。** When writing a reusable workflow section (e.g. "扫描件归档工作流"), use placeholders (`<管理人>`, `<产品名>`, `<当天日期>-<管理人>/`) — never the name of the project you happen to be working on today (e.g. `jinmijiafu`). A workflow that only names today's project is not a workflow, it's a task log; the user will call this out ("这只是这个项目的名字啊"). Concrete naming formats (e.g. a specific fund's contract filename pattern) may appear ONLY as an explicit example (「例如…」), never as the rule itself. The rule must be: `ls` the target directory and mirror the existing files' naming exactly.
- **Don't mix AGENTS and README content.** AGENTS.md with a "project overview" section defeats its purpose — agents don't need to know the tech stack to follow coding conventions. Keep each file to its audience.
- **CLAUDE.md best practice: symlink, not mirror.** Run `ln -sf AGENTS.md CLAUDE.md`. Git tracks the symlink itself; any edit to AGENTS.md is instantly reflected in CLAUDE.md with zero drift. Falls back to mirror copy only when the target platform doesn't support symlinks (e.g., some Windows setups). VS Code 在 symlink 创建后可能不立即显示箭头图标——Cmd+Shift+P → Developer: Reload Window 即可刷新（不是创建有问题）。
- **README.md is the facility registry; AGENTS.md references it.** Infrastructure details (NAS addresses, scanner IPs, internal system URLs, credentials management policy) belong in README.md for human consumption. AGENTS.md should keep only a one-line pointer ("设施资源见 README.md") so the agent's context isn't bloated with operational manuals that are irrelevant to coding conventions.
- **README must be truthful to the current repo state.** Before updating it for public display, verify with real evidence: run `pytest`, pull numbers from `report/`/experiment JSONs, `git remote get-url origin` for the real URL, add a `LICENSE` file if a license is claimed. Never leave placeholder URLs (`your-org`), placeholder author fields, or advertise unfinished features; fold completed "research directions" into a Results section. Full workflow: `repository-cleanup` skill → "Public-repo readiness pass".
- **Progressive gitignore changes need progressive commits.** Each new gitignore pattern + its untracked files is one commit, not one big lump. This keeps the history reviewable and makes it easy to revert a single pattern.
- **Gitignore after orphan-branch rewrite.** When you rebuild history (orphan branch to ditch large files), re-check `.gitignore` — orphan checkout resets the index, and `git add .` may scope files you intended to ignore.
