# AGENTS.md 骨架 — 本用户公开仓"老规矩"模板（源自 rail-cli / trading-agents）

> 使用：复制到新公开仓根目录，替换 <占位>，按项目裁剪。中文。

# <项目名>

<一句话定位：这个仓库是什么。>

## 项目结构

- <目录/文件>：<作用>
- SKILL.md：<本技能主文件/主模式说明>
- scripts/：<可执行脚本>
- references/：<参考文档，附 README.md 溯源>
- docs/：<设计文档、计划>

## 关键事实

- <环境/依赖事实，如：~/<依赖仓库> 存在、venv 路径、Python 版本>
- <已实测的 API/函数清单，标注"已实测可用"及耗时>
- <本机特有前提（如无 proxy 变量）>

## 约定

- <文件操作默认相对此目录>
- <技能同步>：本技能目录 <~/.agents/skills/coding/<name>> 是同一仓库的 git 克隆；改动流程：本仓库 commit+push → 技能侧 pull
- 相关技能：<repo-documentation、subagent-driven-development 等>

## Git 规则（硬性）

- 公开仓库：严禁敏感信息（密码/密钥/个人联系方式）
- **禁止 `git add .` / `git add -A`**——只 add 具体路径
- 逐任务 commit（一个逻辑改动 = 一个 commit），Conventional Commits（feat:/fix:/docs:...）
- **commit 后立即 push**
- .gitignore：`__pycache__/`、`.DS_Store`、`*.pyc`、`.venv/` 等

## 行为约束

- 零编造：数据/数字必须可溯源（标注来源与抓取时间）；失败标 UNVERIFIED，严禁凭记忆编数字
- 研究/分析类内容声明"非投资建议"
- <按项目追加：如 LaTeX 规则、报告格式约定等>
