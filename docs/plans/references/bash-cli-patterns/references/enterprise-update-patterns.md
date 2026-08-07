# Enterprise Update — Session Reference

## JAR/HTML Multi-Path Detection

The `enterprise update` command searches sources in this order:

1. `/opt/` → `/opt/enterprise/backend/target/enterprise-mvp-*.jar`
2. `$PROJECT_ROOT` → same sub-path
3. Root of each dir: `app.jar` or `enterprise-*.jar`

User selects when multiple found; auto-selects [0] in non-TTY.

## Add Jar Dedup Function

```bash
add_jar() {
  local p="$1" l="$2"
  if [ ${#JAR_OPTS[@]} -gt 0 ]; then
    for existing in "${JAR_OPTS[@]}"; do
      [ "$existing" = "$p" ] && return
    done
  fi
  JAR_OPTS+=("$p"); JAR_LABELS+=("$l")
}
```

## Update Flow

1. Parse flags (--all, -b, -f, -c) — skip prompts if set
2. If no flags: interactive, prompt for each component
3. Find sources only for components marked for update
4. Execute: docker stop → docker cp → docker start
5. Wait for backend health (poll loop, not just sleep)
6. Verify: always check backend + frontend health

## Key Script Variables

- `BP=8082` — backend port
- `FP=8088` — frontend port
- `PROJECT_ROOT` — auto-detected project root
- `JAR_NEED_UPDATE`, `HTML_NEED_UPDATE`, `CLI_NEED_UPDATE` — update flags

## Inline CLI Commands (not delegation)

**User preference:** CLI subcommands should be implemented directly in the `enterprise` script, not sourced from external scripts. A `cmd_doctor` function containing all logic inline is preferred over `bash doctor.sh`.

Benefits: single-file deployment, no missing-file errors on server, consistent error handling via shared `ok()`/`fail()`/`warn()`/`info()` functions at the top of the CLI.

## JAR Artifact Name Discovery

Never assume `app.jar`. Spring Boot projects produce `artifactId-version-SNAPSHOT.jar`:

```bash
# Extract from pom.xml
grep -A1 '<artifactId>' pom.xml | grep -v parent | head -1
```

The actual artifact is `enterprise-mvp-0.1.0-SNAPSHOT.jar` in `backend/target/`.

## Doctor Command Structure

The `enterprise doctor` command follows this section structure:

| # | Section | Docker required? | Key check |
|---|---------|-----------------|-----------|
| 1 | 文件完整性 | No | Required files exist |
| 2 | Docker 引擎 | No | daemon + colima fallback |
| 3 | Docker 镜像 | Yes | 3 images present |
| 4 | 端口检查 | Partial | ss/lsof, container-owned check |
| 5 | 环境变量 | No | .env + AI_VISION_KEY |
| 6 | 容器状态 | Yes | 3 containers running |
| 7 | 后端健康 | Yes | /api/health → 200 |
| 8 | 前端可达 | Yes | port root → 200 |
| 9 | 磁盘空间 | No | usage % |

Sections 3, 6, 7, 8 are entirely hidden when Docker is not running (guarded by `$DOCKER_OK`).
