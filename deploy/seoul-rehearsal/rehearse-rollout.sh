#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

if [[ $# != 2 ]]; then
  printf 'Usage: %s BASELINE_IMAGE_ID GHCR_IMAGE_AT_DIGEST\n' "$0" >&2
  exit 2
fi
baseline=$1
candidate_ref=$2
if [[ ! "$baseline" =~ ^sha256:[0-9a-f]{64}$ ||
      ! "$candidate_ref" =~ ^ghcr[.]io/homuracatmadoka/cupedia-seoul-rehearsal-20261126@sha256:[0-9a-f]{64}$ ]]; then
  printf 'Expected a baseline image ID and the rehearsal GHCR digest reference.\n' >&2
  exit 2
fi

docker_bin=$(command -v docker)
run_id="$(date -u +%Y%m%dT%H%M%SZ)-$$"
preview="cupedia-rollout-rehearsal-$run_id"
label=io.cupedia.rollout-rehearsal
candidate=
production_before=
phase=preflight
baseline_mock=not-tested
baseline_ready=false
candidate_ready=false
fault_exercised=false
rollback_ready=false

production_snapshot() {
  "$docker_bin" container inspect --format \
    '{{.Id}}|{{.Image}}|{{.State.StartedAt}}|{{.RestartCount}}|{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}' \
    cupedia-prod-app-1
}

preview_id() {
  "$docker_bin" container ls --all --no-trunc --format '{{.Names}} {{.ID}}' |
    awk -v name="$preview" '$1 == name { print $2 }'
}

owned_preview() {
  local id=$1 identity
  [[ "$id" =~ ^[0-9a-f]{64}$ ]] || return 1
  identity=$("$docker_bin" container inspect --format \
    '{{.Name}}|{{index .Config.Labels "io.cupedia.rollout-rehearsal"}}' "$id") || return 1
  [[ "$identity" == "/$preview|$run_id" ]]
}

remove_preview() {
  local id
  id=$(preview_id) || return 1
  [[ -n "$id" ]] || return 0
  owned_preview "$id" || return 1
  "$docker_bin" container rm -f "$id" >/dev/null || return 1
  id=$(preview_id) || return 1
  [[ -z "$id" ]]
}

finish() {
  local result=$1 cleaned=false prod_same=false after
  trap - EXIT
  if remove_preview; then
    cleaned=true
  else
    result=1
    printf 'Rehearsal preview could not be safely cleaned up.\n' >&2
  fi
  if [[ -n "$production_before" ]] &&
      after=$(production_snapshot) && [[ "$after" == "$production_before" ]]; then
    prod_same=true
  else
    result=1
    printf 'Production identity and health could not be confirmed unchanged.\n' >&2
  fi
  local success=false
  if ((result == 0)); then
    success=true
  fi
  jq -cn --arg run "$run_id" --arg preview "$preview" --arg phase "$phase" \
    --arg baseline "$baseline" --arg candidate "$candidate" --arg candidateRef "$candidate_ref" \
    --arg baselineMock "$baseline_mock" --argjson baselineReady "$baseline_ready" \
    --argjson candidateReady "$candidate_ready" --argjson faultExercised "$fault_exercised" \
    --argjson rollbackReady "$rollback_ready" --argjson productionUnchanged "$prod_same" \
    --argjson previewRemoved "$cleaned" --argjson ok "$success" '
    {$run,$preview,$phase,$baseline,$candidate,$candidateRef,$baselineMock,$baselineReady,
     $candidateReady,$faultExercised,$rollbackReady,$productionUnchanged,$previewRemoved,$ok}'
  exit "$result"
}

trap 'finish "$?"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

existing_preview=$(preview_id)
[[ -z "$existing_preview" ]]
production_before=$(production_snapshot)
IFS='|' read -r _ live_image _ _ live_state live_health <<< "$production_before"
[[ "$live_image" == "$baseline" && "$live_state" == running && "$live_health" == healthy ]]

candidate=$("$docker_bin" image inspect --format '{{.Id}}' "$candidate_ref")
[[ "$candidate" =~ ^sha256:[0-9a-f]{64}$ && "$candidate" != "$baseline" ]]
for image in "$baseline" "$candidate"; do
  [[ "$("$docker_bin" image inspect --format '{{.Os}}/{{.Architecture}}' "$image")" == linux/amd64 ]]
done

read -r -d '' probe_source <<'JS' || :
const origin = "http://127.0.0.1:3000";
const mode = process.argv[1];
async function read(path) {
  return fetch(origin + path, { signal: AbortSignal.timeout(3000) });
}
async function requireStatus(path, status) {
  const response = await read(path);
  if (response.status !== status) throw new Error("Returned an unexpected HTTP status");
  return response;
}
async function manifest() {
  const response = await requireStatus("/manifest.webmanifest", 200);
  const content = await response.json();
  if (typeof content.name !== "string" || !Array.isArray(content.icons) ||
      !content.icons.some(icon => icon?.src === "/icons/cupedia.png")) {
    throw new Error("Did not find the expected app manifest and icon");
  }
}
async function icon() {
  const response = await requireStatus("/icons/cupedia.png", 200);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 8 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error("Did not receive the expected PNG format");
  }
}
async function mockCanteens() {
  const response = await requireStatus("/api/canteens", 200);
  const content = await response.json();
  if (!Array.isArray(content.canteens) ||
      !content.canteens.some(canteen => canteen?.id === "mock-canteen-demo")) {
    throw new Error("Did not find the mock canteen data");
  }
}
async function main() {
  if (process.getuid() !== 1000) throw new Error("Probe ran under the wrong UID");
  if (mode === "mock") {
    await mockCanteens();
    return;
  }
  await manifest();
  await icon();
  // Only a healthy candidate can reach the deliberate failed-check exit.
  if (mode === "inject") process.exitCode = 42;
}
main().catch(() => { process.exitCode = 1; });
JS

probe() {
  local id mode=$1
  id=$(preview_id) || return 1
  owned_preview "$id" || return 1
  "$docker_bin" container exec "$id" node -e "$probe_source" "$mode"
}

ready() {
  local deadline=$((SECONDS + 60)) id configuration
  while ((SECONDS < deadline)); do
    id=$(preview_id) || return 1
    owned_preview "$id" || return 1
    configuration=$("$docker_bin" container inspect --format \
      '{{.State.Running}}|{{.Image}}|{{.HostConfig.NetworkMode}}|{{.Config.User}}|{{len .HostConfig.PortBindings}}' "$id") || return 1
    [[ "$configuration" == "true|$1|none|1000:1000|0" ]] || return 1
    if probe startup; then
      return 0
    fi
    sleep 1
  done
  return 1
}

launch() {
  local image=$1
  remove_preview || return 1
  "$docker_bin" run --detach --rm --pull never --init \
    --name "$preview" --label "$label=$run_id" \
    --network none --user 1000:1000 --memory 384m --memory-swap 384m --cpus 0.5 \
    --pids-limit 128 --cap-drop ALL --security-opt no-new-privileges \
    --log-driver local --log-opt max-size=5m --log-opt max-file=1 \
    --env NODE_ENV=production --env NEXT_TELEMETRY_DISABLED=1 --env PORT=3000 \
    --env HOSTNAME=127.0.0.1 --env CANTEEN_MOCK_DATA=true \
    --env DATABASE_URL=postgresql://fixture:fixture@127.0.0.1:5432/fixture \
    --env AUTH_SECRET=rehearsal-fixture-auth-key-only-000000000000 \
    --env AUTH_URL=http://127.0.0.1:3000 \
    --env MINIO_ENDPOINT=https://fixture-objects.invalid --env MINIO_REGION=auto \
    --env MINIO_ACCESS_KEY=fixture-only --env MINIO_SECRET_KEY=fixture-only \
    --env MINIO_BUCKET=cupedia-rehearsal-public \
    --env MINIO_PRIVATE_BUCKET=cupedia-rehearsal-private \
    --env MINIO_PUBLIC_URL=http://127.0.0.1:3000/rehearsal-public \
    "$image" >/dev/null || return 1
  ready "$image"
}

phase=baseline
launch "$baseline"
baseline_ready=true
baseline_mock=not-confirmed
if probe mock; then
  baseline_mock=passed
fi

phase=candidate
if ! launch "$candidate" || ! probe mock; then
  phase=unexpected-candidate-failure
  if launch "$baseline"; then
    rollback_ready=true
  fi
  exit 1
fi
candidate_ready=true

phase=simulate-failure
fault_status=0
probe inject || fault_status=$?
if [[ "$fault_status" == 42 ]]; then
  fault_exercised=true
fi

phase=rollback
launch "$baseline"
rollback_ready=true
if [[ "$baseline_mock" == passed ]]; then
  probe mock
fi
[[ "$fault_exercised" == true ]]
phase=complete
