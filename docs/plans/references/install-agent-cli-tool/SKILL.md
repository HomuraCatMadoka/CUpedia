---
name: install-agent-cli-tool
description: Install a pip-installable CLI tool (MCP server, agent helper, or utility) and configure it for both Claude Code and Hermes Agent. Covers pip/pipx/venv installation, PATH setup, Hermes MCP registration, Hermes skill install, Claude Code wrapping/MCP config, and proxy management.
tags: [install, pip, cli, mcp, hermes, claude-code, configuration, agent-tools]
---

# Install Agent CLI Tool for Claude Code + Hermes

## When to Use

Load this skill when the user asks to install a CLI tool (typically pip-installable) that serves as an AI agent helper — MCP server, content compressor, web fetcher, graph builder, etc. — and wants it available in **both** Claude Code and Hermes Agent.

### Trigger Patterns

- "下载安装 X" (download and install X)
- "装 X 给 claude 和 hermes" (install X for both claude and hermes)
- User provides a GitHub repo URL for a Python CLI tool
- "install X from pip and configure it"
- "wrap claude with X"

### What This Skill Covers

The full lifecycle:
1. Install the CLI tool (pip / pipx / venv)
2. Add to PATH (symlink, .zshrc, or direct)
3. Register as MCP server in Hermes config.yaml
4. Install skill files (SKILL.md) to ~/.hermes/skills/
5. Configure Claude Code (headroom wrap, MCP server, or CLAUDE.md registration)
6. Start background services (proxies, daemons)
7. Verify everything works

---

## Phase 1: Detect Installation Method

First, determine the right Python install method:

```bash
# Check pipx availability
which pipx 2>/dev/null && echo "pipx available" || echo "pipx not available"
```

| Environment | Preferred Method |
|---|---|
| pipx available | `pipx install <pkg>` |
| Homebrew Python / PEP 668 | `python3 -m venv ~/.<tool>-venv && source ~/.<tool>-venv/bin/activate && pip install <pkg>` |
| System Python | `pip3 install --user <pkg>` |
| npm package | `npm install -g <pkg>` |

### pip install (when venv is needed)

```bash
python3 -m venv ~/.<tool>-venv
source ~/.<tool>-venv/bin/activate
pip install <pkg-or-url>
# Binary is at ~/.<tool>-venv/bin/<binary>
```

### pipx install (cleanest)

```bash
pipx install <pkg>
pipx install https://github.com/owner/repo/archive/main.zip
```

### --user install

```bash
pip3 install --user <pkg>
# Binary is at ~/Library/Python/3.xx/bin/<binary> (macOS)
```

---

## Phase 2: Add to PATH

Symlink to a directory already on PATH, or add to shell config:

```bash
# Symlink into a known PATH dir
ln -sf ~/.<tool>-venv/bin/<binary> ~/Library/Python/3.14/bin/<binary>
```

Or add to .zshrc:

```bash
grep -q "<path>" ~/.zshrc 2>/dev/null || cat >> ~/.zshrc << 'EOF'
export PATH="$HOME/some/path:$PATH"
EOF
```

Verify:

```bash
which <binary> && <binary> --version
```

---

## Phase 3: Register MCP Server for Hermes

Two approaches:

### A) Via hermes config set (preferred for new entries)

```bash
hermes config set mcp_servers.<name> '{
  "enabled": true,
  "timeout": 120,
  "command": "/absolute/path/to/binary",
  "args": ["mcp", "serve"]
}'
```

NOTE: `hermes config set` accepts JSON values as a string. The key structure `mcp_servers.<name>` creates the nested config entry.

### B) Edit config.yaml directly (for complex setups)

Only if approach A fails. Find the mcp_servers section and add:

```yaml
  <name>:
    enabled: true
    timeout: 120
    command: /absolute/path/to/binary
    args:
      - mcp
      - serve
```

**IMPORTANT**: The config editor tool (`patch`) may refuse to edit `~/.hermes/config.yaml` as a security measure. In that case, use `hermes config set` instead.

### MCP Tool Naming Convention

Hermes prefixes MCP tools as `mcp_{server_name}_{tool_name}`. E.g., server `headroom` with tool `compress` becomes `mcp_headroom_compress`. Mention this when instructing the agent how to invoke.

---

## Phase 4: Install Skill for Hermes

Some tools ship a SKILL.md. Strategies in order of preference:

### A) Tool has native Hermes support

```bash
<tool> install --platform hermes
```

Example: `graphify install --platform hermes`

### B) Tool installed a skill to another agent dir

```bash
cp -r ~/.agents/skills/<name> ~/.hermes/skills/<name>
# or
cp -r ~/.claude/skills/<name> ~/.hermes/skills/<name>
```

### C) Download skill from GitHub

```bash
curl -sL "https://raw.githubusercontent.com/owner/repo/main/skills/<name>/SKILL.md" \
  > ~/.hermes/skills/<name>/SKILL.md
```

---

## Phase 5: Configure Claude Code

### A) Tool supports wrapping (headroom pattern)

```bash
headroom wrap claude
```

This sets up:
- Proxy redirect (ANTHROPIC_BASE_URL)
- MCP tools for retrieval
- rtk (Rust Token Killer) for token optimization
- Serena MCP for output analysis

**Prerequisite check**: If the wrap fails with `ImportError: Using http2=True, but the 'h2' package is not installed`, fix with:

```bash
pip3 install --user 'httpx[http2]'
```

### B) Manual MCP server registration

Claude Code stores MCP config in `~/.claude/.claude.json`:

```json
{
  "mcpServers": {
    "<name>": {
      "command": "/path/to/binary",
      "args": ["mcp", "serve"]
    }
  }
}
```

### C) Skill registration

Some tools need to be registered in `~/.claude/CLAUDE.md`:

```markdown
- **<name>** (`~/.claude/skills/<name>/SKILL.md`) - <description>
```

---

## Phase 6: Background Services

If the tool runs a persistent proxy/daemon:

```bash
terminal(
  command="<binary> proxy --port 8787",
  background=true
)
```

Verify:

```bash
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:<port>/health
# Should return 200
```

If the port is already in use (e.g., from `headroom wrap claude`), just verify the existing instance responds.

---

## Verification Checklist

Run all checks before reporting success:

```bash
# 1. CLI works
which <binary> && <binary> --version

# 2. Hermes MCP registered
grep -A5 "<name>:" ~/.hermes/config.yaml

# 3. Hermes skill exists (if applicable)
ls ~/.hermes/skills/<name>/SKILL.md

# 4. Claude Code configured
grep -A3 "<name>" ~/.claude/.claude.json 2>/dev/null || echo "check CLAUDE.md"

# 5. Proxy/daemon running (if applicable)
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:<port>/health
```

---

## Pitfalls

- **headroom proxy needs httpx[http2]**: The proxy requires the `h2` package. Install with `pip3 install --user 'httpx[http2]'` using the **system** Python (not a venv), because headroom itself may be installed via `--user`.
- **graphify PyPI name mismatch**: The package is `graphifyy` (double y), but the CLI and skill command are `graphify`.
- **agent-reach needs pipx or venv**: If pipx is not installed, use `python3 -m venv ~/.agent-reach-venv` + pip install from the GitHub archive URL.
- **`hermes config set` only accepts JSON strings**: The value must be valid JSON. Use `'{"key": "value"}'` format, NOT yaml syntax.
- **MCP servers auto-discover on session start**: After adding an MCP server to Hermes config, the tools appear in the **next** session. `hermes tools reload` doesn't exist — the user needs to start a new conversation.
- **headroom `.claude.json` overwrite**: `headroom wrap claude` may overwrite `~/.claude/.claude.json`. Check before/after to avoid losing existing MCP configs.
- **Background proxy processes**: If `headroom wrap claude` times out during downloads, the proxy may still be running. Verify with `curl http://127.0.0.1:8787/health` before retrying.
