# Canteen menu identity preflight runbook

Run this preflight against production after the application commit intended for
the #643 deployment is active, all older writers are stopped, and immediately
before approving the #643 contract migration. Run it again if the application
commit changes or any menu writer runs before the migration.

## Read-only execution

Use a dedicated, non-superuser role with no write grants. Grant `USAGE` on the
application schema and `SELECT` only on `canteen_menu_items`,
`canteen_menu_sources`, `canteen_dish_votes`, and
`canteen_dish_comments`. These tables use RLS in production, so the execution
role must be able to see complete rows (the deployment DBA may grant
`BYPASSRLS` to this otherwise read-only role). The command rejects an
RLS-filtered role instead of accepting a zero-row false positive.

Inject `DATABASE_URL` through the approved secret manager and set
`PREFLIGHT_APPLICATION_COMMIT` to the deployed commit. Do not put credentials
in command arguments, shell history, logs, or the saved artifact. Disable shell
tracing before secret injection.

```bash
set +x
umask 077
export PREFLIGHT_APPLICATION_COMMIT="<deployed-commit>"
# The secret manager injects DATABASE_URL into this process environment.
node --import tsx scripts/preflight-canteen-menu-identity.ts --format=json \
  > canteen-menu-identity-preflight-v1.json
status=$?
unset DATABASE_URL
test "$status" -eq 0
```

The JSON output is already sanitized. Keep the artifact access-controlled,
verify its `applicationCommit`, `generatedAt`, contract version, and target
issue, then attach it to the #643 deployment decision. The default human form
is suitable for an operator terminal but is not the approval artifact.

Stop the deployment and open a separately reviewed repair issue for
`PREFLIGHT_UNSAFE`, any failed check, any merge/UUID-replacement requirement,
or any unsupported/contradictory identity. Also stop for configuration/database
errors, missing complete RLS visibility, unexpected report schema/version, or
an application commit mismatch. Do not repair, merge, rerun sync, or edit the
Drizzle journal from this workflow.
