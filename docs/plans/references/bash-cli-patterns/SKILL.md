---
name: bash-cli-patterns
description: "Robust patterns for bash CLI tools: set -euo pipefail safety, multi-source detection, TTY-aware prompts, flag parsing, dedup logic."
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [linux, macos]
metadata:
  hermes:
    tags: [bash, cli, scripting, patterns, shell]
    related_skills: [systematic-debugging, writing-plans]
---

# Bash CLI Patterns

## Overview

Common patterns when writing or maintaining bash-based CLI tools, especially those running with `set -euo pipefail`.

---

## Cross-Platform Compatibility (macOS + Linux)

Scripts targeting both platforms need explicit fallbacks for diverging tools.

### Port checking: `ss` vs `lsof`

`ss` is Linux-only (iproute2). macOS uses `lsof`.

```bash
# Cross-platform port-listening check
if command -v ss &>/dev/null; then
  busy=$(ss -tlnp "sport = :$PORT" 2>/dev/null | grep -q .)
elif command -v lsof &>/dev/null; then
  busy=$(lsof -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | grep -q .)
else
  busy=false
fi
```

**Pitfall:** Don't use `ss` without a fallback — macOS has neither `ss` nor `netstat -tlnp` in the same format. `lsof` is the reliable cross-platform choice for macOS.

### Grep: `-P` is GNU-only

`grep -P` (Perl regex) is a GNU extension — unavailable on macOS BSD grep.

- **Bad (Linux-only):** `grep -qP "pattern1|pattern2"`
- **Good (cross-platform):** `grep -qE "pattern1|pattern2"` — `-E` works on BSD and GNU grep

### Docker compose: v2 vs v1

Modern Docker includes compose as a plugin (`docker compose`). Legacy systems have `docker-compose` as a separate binary.

```bash
if docker compose version &>/dev/null; then
  dc_ver=$(docker compose version)
elif docker-compose --version &>/dev/null; then
  dc_ver=$(docker-compose --version)
fi
```

### Docker context: Colima vs default

macOS users may run Docker via Colima instead of Docker Desktop. The default context often points to a broken socket.

```bash
# Try default context first, fall back to Colima
if docker info &>/dev/null; then
  DOCKER_OK=true
else
  if [[ "$(uname)" == "Darwin" ]] && command -v colima &>/dev/null; then
    docker context use colima &>/dev/null
    if docker info &>/dev/null; then
      DOCKER_OK=true
    fi
  fi
fi
```

### Docker startup

```bash
if [[ "$(uname)" == "Darwin" ]]; then
  open -a Docker   # macOS Docker Desktop
elif command -v systemctl &>/dev/null; then
  systemctl start docker   # Linux systemd
elif command -v service &>/dev/null; then
  service docker start     # Linux sysvinit
fi
```

### Guard Docker-dependent checks

When Docker is not running, `docker ps` / `docker images` / `docker compose` spew API errors to stderr. Guard all Docker-dependent sections:

```bash
if ${DOCKER_OK:-false}; then
  # check images, containers, health, etc.
fi
```

### Port conflict detection (non-Docker context)

When Docker is not running, occupied ports may be SSH tunnels or other services — don't report them as conflicts:

```bash
if $port_busy; then
  if ${DOCKER_OK:-false} && docker ps ... | grep ... ; then
    ok "本服务占用"
  elif ${DOCKER_OK:-false}; then
    fail "已被其他进程占用"
  else
    warn "已占用（Docker 未运行，无法确认来源）"
  fi
fi
```

### Loading `.env` with fallback defaults

A common pattern: load environment overrides from `.env`, then fill unset vars with script-level defaults.

```bash
# 1. Set hardcoded defaults first
DB_PORT="${DB_PORT:-3307}"
BACKEND_PORT="${BACKEND_PORT:-8080}"

# 2. Source .env (overrides the defaults if set)
if [ -f "docker/.env" ]; then
  source "docker/.env" 2>/dev/null
  # Re-apply defaults for any variable the .env didn't set
  DB_PORT="${DB_PORT:-3307}"
  BACKEND_PORT="${BACKEND_PORT:-8080}"
fi
```

**Why re-apply defaults after source:** `source` doesn't unset variables — but if `.env` is malformed or missing a variable, the re-apply ensures you always have a value. Without it, a `.env` that sets only `BACKEND_PORT` would leave `DB_PORT` empty if it wasn't exported before `source`.

**Alternative (if .env is guaranteed complete):** Just set defaults before sourcing and let `.env` override naturally. The re-apply is defensive.

### `sed -i` portability

`sed -i` on macOS requires an empty backup suffix; GNU sed treats it as optional.

```bash
# macOS: sed -i '' 's/foo/bar/' file
# Linux: sed -i 's/foo/bar/' file

# Cross-platform function
sed_inplace() {
  if [[ "$(uname)" == "Darwin" ]]; then
    sed -i '' "$@"
  else
    sed -i "$@"
  fi
}
```

---

## `set -euo pipefail` Safety

### Always active. Never disable without extreme cause.

### Pitfall: empty array expansion inside a function

```bash
set -euo pipefail

# BROKEN — empty array expands to "" which is "unbound" under set -u
myfunc() {
  local p="$1"
  for existing in "${ARR[@]}"; do ...; done   # ← fails on first call when ARR is empty
}

# FIXED — guard with length check
myfunc() {
  local p="$1"
  if [ ${#ARR[@]} -gt 0 ]; then
    for existing in "${ARR[@]}"; do ...; done
  fi
}
```

**Root cause:** Under `set -u`, `${array[@]}` on an empty array inside a function body is treated as unbound. `${#array[@]}` (length) is safe.

### Pitfall: `ls` with empty glob

```bash
# BROKEN — ls returns non-zero when glob matches nothing → set -e kills subshell
jar=$(ls /path/nonexistent-*.jar 2>/dev/null | head -1)

# FIXED — || true prevents set -e from firing
jar=$(ls /path/nonexistent-*.jar 2>/dev/null | head -1) || true
```

**Root cause:** `set -e` + `pipefail`: `ls` fails → pipeline exits non-zero → subshell dies → parent sees non-zero from `$(...)`. With `set -e`, the assignment doesn't suppress the error.

### Pitfall: `((var++))` returns exit code 1 when var is 0

```bash
# BROKEN — triggers || fail even on success
ok() { echo "PASS: $1"; ((PASS++)); }
bash -n script.sh && ok "syntax" || fail "syntax"
# When PASS=0, ((0++)) evaluates to 0 (falsy) → exit code 1 → || fires

# FIXED — use arithmetic expansion instead
ok() { echo "PASS: $1"; PASS=$((PASS+1)); }
```

**Root cause:** In bash, `((var++))` returns the **old** value of var. When var is 0, `((0))` is falsy (exit code 1). This silently breaks `&& ||` chains and `set -e` scripts.

**Alternative:** `((var+=1))` or `((++var))` — pre-increment returns the new value, so when var goes from 0→1, `((1))` is truthy (exit code 0). But `$((var+1))` is clearest.

### Pitfall: Conditional function definitions inside `if` blocks

Defining a function inside an `if` block works in bash but can cause surprising scope issues. The function is defined at parse time but conditionally available:

```bash
if $CONDITION; then
  myfunc() { echo "hello"; }
fi
# myfunc is still defined here even if CONDITION was false!
```

**Fix:** Define functions unconditionally at script scope. Use the conditional only to decide whether to call them, or use `if declare -F myfunc &>/dev/null; then myfunc; fi` to guard the call.

### Pitfall: Failing to check build config before asserting file paths

```bash
# BROKEN — assumed a filename that doesn't match the build
if [ ! -f "app.jar" ]; then
  warn "JAR not found"    # app.jar doesn't exist, but the real JAR does
fi

# FIXED — check pom.xml / build.gradle first
ARTIFACT=$(grep -m1 '<artifactId>' pom.xml | sed 's/.*<artifactId>//;s/<\/artifactId>//')
VERSION=$(grep -m1 '<version>' pom.xml | head -1 | sed 's/.*<version>//;s/<\/version>//')
JAR="backend/target/${ARTIFACT}-${VERSION}.jar"
if [ ! -f "$JAR" ]; then
  warn "后端编译包不存在 — 需先编译"
fi
```

Spring Boot projects produce `artifactId-version-SNAPSHOT.jar`, never `app.jar`. Always read `pom.xml` to find the real name.

### Pitfall: `read` in non-TTY mode

```bash
# BROKEN — read returns non-zero on EOF (non-interactive) → set -e exits
echo -n "Proceed? [Y/n] "; read -r ans

# FIXED — guard with TTY check
if [ -t 0 ]; then
  echo -n "Proceed? [Y/n] "; read -r ans
fi
```

---

## TTY-Aware Prompting

Use `[ -t 0 ]` to detect interactive mode:

```bash
if [ -t 0 ]; then
  echo -n "  更新后端？[Y/n] "; read -r ans
  [ "$ans" = "n" ] || [ "$ans" = "N" ] && skip=true
fi
```

**Non-TTY default:** When `[ -t 0 ]` is false (CI, pipe, remote exec), skip prompts and use a safe default (usually "yes/update").

This pattern is better than checking for a `--yes` flag — it works automatically in any non-interactive context.

---

## Flag Parsing for CLI Subcommands

```bash
case "${1:-}" in
  update)
    shift
    FLAG_A=false; FLAG_B=false
    while [ $# -gt 0 ]; do
      case "$1" in
        -a|--flag-a) FLAG_A=true  ;;
        -b|--flag-b) FLAG_B=true  ;;
        --all)       FLAG_A=true; FLAG_B=true ;;
        *) usage ;;
      esac; shift
    done
    cmd_update
    ;;
esac
```

**Pattern:** Parse flags before calling the command function, not inside it. This keeps the function testable — it reads global flag variables.

---

## Multi-Source Detection with Dedup

When a CLI tool needs to find source files across multiple paths:

```bash
# 1. Define a dedup adder
add_item() {
  local p="$1" l="$2"
  for existing in "${ITEMS[@]}"; do       # safe: ${#ITEMS[@]} > 0 guard not needed
    [ "$existing" = "$p" ] && return      # because for loop over empty array is a no-op
  done
  ITEMS+=("$p"); LABELS+=("$l")
}

# 2. Search multiple paths
for dir in "/path/a" "/path/b"; do
  for f in "$dir"/target/*.jar; do
    [ -f "$f" ] && add_item "$f" "$dir"
  done
done

# 3. Present options to user
case ${#ITEMS[@]} in
  0) echo "not found" ;;
  1) SOURCE="${ITEMS[0]}" ;;
  *)
    echo "选择来源:"
    for i in "${!ITEMS[@]}"; do echo "  [$((i+1))] ${LABELS[$i]}"; done
    [ -t 0 ] && read -r sel || sel=1
    SOURCE="${ITEMS[$((sel-1))]}"
    ;;
esac
```

**Note:** The for loop over an empty array is safe — it's a no-op in bash. The guard is only needed inside a function with `set -u` (see first pitfall). Here, `add_item` runs at script scope, not function scope, so it's fine.

---

## Markdown Documentation for CLI Tools

### Structure preferences

- Steps should use `###` headings and bold (`** **`) for sub-steps
- Flag tables or lists inline, not as separate large blocks
- Links format: `[display.md](path/to/file.md)` — display text is the filename, href is the real path
- Code blocks for commands, not inline backticks for multi-line

### Update/deploy doc pattern

```markdown
### 首次部署（`install`）

```bash
# 1. Step one
cmd1
# 2. Step two
cmd2
```

### 运维更新（`update`）

**第一步：放文件**

```bash
cp /source/file /target/
```

**第二步：执行更新**

```bash
cli-tool update
```
```

---

## References

- `references/enterprise-update-patterns.md` — enterprise deployment, port conflicts, dependency version pinning
- `references/macos-zip-chinese-encoding.md` — handling Chinese filenames in zip files on macOS (CP437→UTF-8 decode via Python zipfile)
