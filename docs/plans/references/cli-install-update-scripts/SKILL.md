---
name: cli-install-update-scripts
description: "Use when writing install/update scripts for a git-repo CLI."
---

# One-Click Install / Update / Uninstall Scripts

Patterns for shipping a repo-based CLI with a single `install.sh` that installs, updates (git pull + reinstall), and uninstalls. Developed on rail-cli (zero-dependency Python CLI, stdlib only) — verified 2026-08-07.

## When to use
- A CLI is distributed as a git repo (clone → install), not via pip/brew.
- The tool is zero-dependency Python (stdlib only) — "install" is just copying files + creating a command symlink.
- You want users to be able to pull author updates with one command (`./install.sh --update`).

## Core architecture

Three modes in one script: `install` (default), `--update`, `--uninstall`, plus `--prefix <path>` / `--user` (prefix=~HOME) flags. Structure:

```
常量 → 工具函数 (info/warn/die/sed_inplace/find_python) → install_files() → verify_install() → 参数解析 → 模式分发
```

Key pieces:
- **Install = copy + symlink**: `cp rail RAIL_DEST/rail`, `cp -r rail_cli RAIL_DEST/rail_cli`, `ln -s RAIL_DEST/rail BIN_DIR/rail`. No pip needed.
- **Install metadata**: write `$RAIL_DEST/.install-meta` containing `PREFIX=<prefix>` at install time. `--update` and `--uninstall` read it to recover the ORIGINAL install location — the user doesn't have to remember which prefix they chose. This is the single most important design decision.
- **Reinstall must clean stale files**: `rm -rf "$RAIL_DEST/rail_cli"` before `cp -r` — otherwise deleted source files linger in the installed copy after updates.
- **Uninstall only removes what you installed**: delete the symlink + `RAIL_DEST`, but NOT the whole prefix dir (`bin/`, `lib/` may hold other tools). Leaving empty dirs is correct.

## Pitfall 1: macOS system Python 3.9 breaks `dict | None` code

`/usr/bin/python3` on macOS is 3.9.6 — it rejects `dict | None` type annotations. `#!/usr/bin/env python3` resolves via PATH and may hit the system 3.9 even when a modern conda/brew python exists. **Fix: rewrite the installed copy's shebang to the detected python's absolute path** (same trick venvs use):

```bash
# after copying rail to RAIL_DEST:
sed_inplace "1s|^#!.*|#!$PYTHON_BIN|" "$RAIL_DEST/rail"
```

## Pitfall 2: python auto-detect needs fallbacks beyond PATH

`find_python` must try, in order: `$PYTHON` env var → `python3` on PATH (must pass a >=3.10 version check) → versioned aliases (`python3.14`..`python3.10`) → **absolute common locations** (Homebrew/miniconda paths). Without step 4, a stripped PATH (e.g. a terminal that lost its profile exports) fails with "未找到 Python >= 3.10" even though conda python exists.

```bash
for p in "$HOME/miniconda3/bin/python3" "$HOME/anaconda3/bin/python3" \
         "/opt/homebrew/Caskroom/miniconda/base/bin/python3" \
         "/opt/homebrew/bin/python3" "/usr/local/bin/python3"; do
    [ -x "$p" ] && "$p" -c 'import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)' 2>/dev/null && { echo "$p"; return 0; }
done
```

## Pitfall 3: macOS bash 3.2 + full-width char after `$VAR` = unbound variable

`/bin/bash` 3.2 (macOS default) misparses a variable followed immediately by a multi-byte UTF-8 char (e.g. full-width `（`, `，`, `。`):

```bash
info "已追加 PATH 到 $SHELL_RC（重新打开终端生效）"   # ← bash 3.2: SHELL_RC: unbound variable
```

**Fix: always brace-delimit before non-ASCII text: `${SHELL_RC}`.** Check every `$VAR` immediately followed by a CJK/full-width char when targeting macOS.

## Pitfall 4: `--update` must NOT silently fall back to the default prefix

If `.install-meta` isn't found anywhere, `--update` must `die` with guidance ("先运行 ./install.sh 安装；若用了自定义 --prefix，请运行 ./install.sh --prefix <路径> --update"), NOT reinstall to `~/.local`. Silent fallback creates a duplicate install the user didn't ask for — this exact bug shipped in the first version.

```bash
find_installed_prefix() {
    for cand in "$HOME/.local" "$HOME" "${PREFIX:-}"; do
        [ -f "$cand/lib/rail-cli/.install-meta" ] && { sed -n 's/^PREFIX=//p' "$cand/lib/rail-cli/.install-meta"; return 0; }
    done
    return 1
}
```

## Pitfall 5: `--update` needs git-repo + origin validation

Before `git pull`, verify: (a) `git rev-parse --is-inside-work-tree` succeeds — the user must run update from inside the clone; (b) `git remote get-url origin` matches the expected repo pattern (`*rail-cli*` etc.) — prevents pulling from an unrelated repo. Then `git pull --ff-only origin main`.

## Pitfall 6: TTY-interactive branches must be tested under a real pty

`echo "y" | ./install.sh` or `<<< "y"` is NOT a TTY — `[ -t 0 ]` is false and the interactive branch (e.g. "add to shell rc?") is silently skipped, so a bug there ships untested. To test: launch with `terminal(pty=true, background=true)`, then answer the prompt via `process(action=submit)`. Also: in non-TTY mode, print the manual command instead of prompting.

## Auto-update: `AUTO_UPDATE` env (default on) + first-run-of-day marker

Shipped in rail-cli 0.2.0 (2026-08-07). The CLI itself can update, both on demand (`rail update`) and automatically on the first invocation of each day.

- **Record the repo in install metadata**: `.install-meta` must carry `PREFIX=<prefix>` AND `REPO=<repo path>` (`printf 'PREFIX=%s\nREPO=%s\n' "$PREFIX" "$SCRIPT_DIR"`). The CLI locates the git clone from `REPO` — without it, an installed copy has no way to know where to pull from.
- **Layout detection from `__file__`** (no argv guessing): package dir's parent has `.install-meta` → installed mode; parent has `.git` → repo mode (clone / pip editable); neither → pip copy, cannot self-update, die with guidance.
- **Delegate to install.sh, don't reimplement**: installed mode runs `bash install.sh --prefix <PREFIX> --update` (the script already validates git-ness + origin + finds the installed prefix). Repo mode is just `git pull --ff-only origin main`; compare HEAD before/after to report "已是最新版本" vs "已更新到 <sha>" (locale-proof, don't grep for "Already up to date").
- **First-run-of-day marker**: file at `$XDG_CACHE_HOME/rail-cli/last-auto-update` (default `~/.cache/rail-cli/`), content = `YYYYMMDD`. `open(path, "a+")` + `fcntl.flock(LOCK_EX)` + read/truncate/write. **Write the marker BEFORE running the update** — concurrent processes and re-entrant calls (e.g. install.sh's verify step invoking `rail version` mid-update) then see the day as already checked, which is what prevents recursive update loops.
- **AUTO_UPDATE parsing**: unset/empty/anything = on; `0|false|no|off|n|disabled` = off. Provide a per-invocation `--no-update` flag (argparse SUPPRESS pattern, accepted before and after the subcommand) for scripts/offline use.
- **stdout purity is critical**: the auto-update runs BEFORE the API command, so any stdout from `git pull` ("Already up to date.") or install.sh info lines corrupts the JSON output. Run the update helper with `capture_output=True` and forward its stdout+stderr to *our* stderr. (This bug shipped and was caught by piping the CLI output through `json.loads`.)
- **Failure must not block**: update failure → warn on stderr, still run the requested command, still write the marker (retry once per day max; offline users don't get a git attempt on every command). Point them at the manual `rail update`.
- **Recursion guards**: `version` and `update` subcommands never trigger auto-update, and install.sh's `verify_install` must run the CLI with `AUTO_UPDATE=0` — otherwise installing/updating re-enters the update path.
- **Explicit `--prefix` wins in find_installed_prefix**: when `rail update` passes the current install's prefix, prefer it over the `~/.local`/`$HOME` scan — otherwise a user with two installs updates the wrong one.
- **Heal stale meta**: if `REPO` is missing from meta, fall back to the cwd if it's the rail-cli repo (origin check) and rewrite `REPO=` back into `.install-meta`.
- **After a successful manual `rail update`, reserve today** (write the marker) so the auto-update doesn't run again the same day.

## Verification checklist (before shipping)

- `bash -n install.sh` — syntax
- Install to a temp prefix (`--prefix /tmp/rail-test`), confirm `.install-meta` written
- `--update` detects the temp location and reinstalls there (not to default)
- `--update` with NO prior install → dies with guidance (exit 1)
- `--update` in a repo with a wrong origin → dies with guidance
- Install under a stripped PATH (`PATH=/usr/bin:/bin`) → find_python fallback still works
- `--uninstall` removes symlink + RAIL_DEST, leaves the prefix dir
- Interactive branch via pty + submit, verifying the rc file was appended

## Related
- `api-endpoint-probing` — probe the API before building the CLI (rail-cli's sts_query date-param trap: a required param omitted → silent empty array, see its pitfalls)
- rail-cli reference implementation: https://github.com/mrtsels/rail-cli (`install.sh`, ~150 lines)
