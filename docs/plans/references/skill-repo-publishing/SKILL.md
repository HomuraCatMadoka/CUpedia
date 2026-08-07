---
name: skill-repo-publishing
description: "Use when publishing a Hermes skill as its own git repo."
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [macos, linux]
metadata:
  hermes:
    tags: [skill-authoring, git, github, publishing, sync]
    related_skills: [subagent-driven-development, repo-documentation, knowledge-organization]
---

# Skill Repo Publishing

把 Hermes 技能发布为独立公开 git 仓库，并维护"双克隆同步"。已验证实例：`mrtsels/rail-cli`、`mrtsels/trading-agents`（2026-08 全流程实测）。

## When to Use

- 用户要求技能拥有自己的公开仓库（本用户的既定模式）
- 现有技能超过单文件规模，需要仓库化
- 需要为已仓库化的技能做双克隆同步（push → 技能侧 pull）

## 布局（双克隆）

- **开发根**：`~/<name>-skill`（或 `~/<name>` 若名称空闲）——日常开发的仓库克隆
- **技能侧**：`~/.agents/skills/coding/<name>`——同一仓库的 git 克隆，Hermes 从这里加载技能
- 改动流转：开发根 commit+push → 技能侧 `git pull origin main`

## Steps（2026-08 trading-agents 实测验证）

1. `gh repo create mrtsels/<name> --public --description "..."`（先 `ls ~` 查名称冲突）
2. clone 到开发根：`~/<name>-skill`（若 `~/<name>` 已被占用——如上游 fork——用 `-skill` 后缀）
3. 把草稿技能内容（SKILL.md、references/）移入克隆；**删除旧草稿目录**（`~/.hermes/skills/...`），避免双份加载
4. 写 README.md（人类指南）、.gitignore（`__pycache__/`、`.DS_Store`、`*.pyc`、`.venv/`）、AGENTS.md（规则，见 `templates/AGENTS.md`）
5. 开发：SKILL.md + `scripts/`；**真实运行验证**后再 commit（零编造纪律：数据/行号引用必须实测）
6. 最终闸门：派 fresh-eyes 审校子代理（配方见本技能 `references/spec-compliance-review.md`；派发机制参考 `subagent-driven-development`，其为 external-dir 技能只读）→ 应用修正 → 回归测试 → commit
7. clone 到技能侧：`git clone https://github.com/mrtsels/<name>.git ~/.agents/skills/coding/<name>`
8. 每次 push 后：`cd ~/.agents/skills/coding/<name> && git pull origin main`
9. 可选：在 `mrtsels/skills` 里登记为 submodule（rail-cli 先例）——**先问用户**，会改动其 skills 仓库

## AGENTS.md 老规矩（本用户公开仓约定）

- **Git**：禁 `git add .`/`-A`，只 add 具体路径；逐任务 commit；Conventional Commits；commit 后立即 push
- **行为**：零编造（数据必须可溯源）；研究类内容声明"非投资建议"；公开仓禁个人敏感信息
- **同步章节**：写明双克隆流转，让未来 agent 知道技能侧要 pull
- **相关技能**：列出相关 skills（repo-documentation、subagent-driven-development 等）
- 语言：中文（用户仓库 AGENTS.md 均为中文）

## Pitfalls

- **名称冲突**：`~/trading-agents` 是上游 fork → 开发根必须用 `~/trading-agents-skill`；先查 `ls ~`
- **双份加载**：clone 到技能侧后必须删 `~/.hermes/skills/coding/<name>` 草稿，否则 Hermes 加载两份
- **嵌套仓库**：技能侧在 `~/.agents/skills`（本身是 mrtsels/skills 的 git 仓库）内部，嵌套 clone 显示为 untracked；rail-cli 是 gitlink（submodule）——明确决定是否登记
- **description**：frontmatter ≤60 字符、触发词开头、句号结尾
- **语义改动需对源验证**：重写工作流语义（如辩论轮次）后，对照源仓库逻辑核对再 commit——fresh-eyes 审校能抓这类错误
- **计划文档入库**：别只放 `~/.hermes/plans/`，拷一份进仓库 `docs/`（rail-cli 先例：docs/PLAN.md）
- **脚本回退路径**：SKILL.md 里写的脚本路径/克隆地址要真实存在，审校子代理专门查这类"看似合理实则不存在"的路径

## Verify

- `skill_view` 显示技能来自技能侧路径且 linked files 齐全
- 两个克隆 `git status` 均干净
- `gh repo view mrtsels/<name> --json visibility,url` 确认 PUBLIC
