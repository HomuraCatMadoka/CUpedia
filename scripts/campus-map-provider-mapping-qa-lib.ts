import { randomUUID } from "node:crypto";

import { isCanonicalCampusMapUuid } from "@/lib/campus-map/canonical-uuid";
import {
  campusMapProviderIdentityKey,
  normalizeCampusMapProviderIdentity,
  normalizeCampusMapProviderMappingTarget,
  sameCampusMapProviderMappingTarget,
  validateCampusMapProviderIdentity,
  type CampusMapProviderIdentity,
  type CampusMapProviderMappingTarget,
} from "@/lib/campus-map/provider-mapping-domain";
import type {
  CampusMapProviderMappingCommand,
  CampusMapProviderMappingCommandResult,
  CampusMapProviderMappingGovernanceResult,
} from "@/lib/campus-map/provider-mapping-registry";

export interface CampusMapProviderMappingQaManifest {
  version: 1;
  provenanceId: string;
  reason: string;
  mapped: Array<{
    label: string;
    managed: boolean;
    identity: CampusMapProviderIdentity;
    target: CampusMapProviderMappingTarget;
  }>;
  unmapped: Array<{
    label: string;
    identity: CampusMapProviderIdentity;
  }>;
}

export interface CampusMapProviderMappingQaPorts {
  command(
    command: CampusMapProviderMappingCommand,
  ): Promise<CampusMapProviderMappingCommandResult>;
  governance(
    identity: CampusMapProviderIdentity,
  ): Promise<CampusMapProviderMappingGovernanceResult>;
  resolve(
    identity: CampusMapProviderIdentity,
  ): Promise<CampusMapProviderMappingTarget | null>;
}

export type CampusMapProviderMappingQaAction = "apply" | "verify" | "cleanup";

export type CampusMapProviderMappingQaResult =
  | {
      status: "ok";
      action: CampusMapProviderMappingQaAction;
      changed: number;
      verified: number;
    }
  | {
      status: "failed";
      stage: "preflight" | "command" | "verify";
      label: string;
      code: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
) {
  const keys = Object.keys(value);
  return (
    keys.length === expected.length &&
    keys.every((key) => expected.includes(key))
  );
}

function parseIdentity(value: unknown): CampusMapProviderIdentity | null {
  const identity = normalizeCampusMapProviderIdentity(value);
  return identity && validateCampusMapProviderIdentity(identity).length === 0
    ? identity
    : null;
}

function parseTarget(value: unknown): CampusMapProviderMappingTarget | null {
  const target = normalizeCampusMapProviderMappingTarget(value);
  if (!target) return null;
  const targetId =
    target.kind === "building" ? target.buildingId : target.placeId;
  return isCanonicalCampusMapUuid(targetId) ? target : null;
}

export function parseCampusMapProviderMappingQaManifest(
  value: unknown,
):
  | { status: "valid"; manifest: CampusMapProviderMappingQaManifest }
  | { status: "invalid"; code: string } {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "version",
      "provenanceId",
      "reason",
      "mapped",
      "unmapped",
    ]) ||
    value.version !== 1 ||
    typeof value.provenanceId !== "string" ||
    !isCanonicalCampusMapUuid(value.provenanceId) ||
    typeof value.reason !== "string" ||
    value.reason.trim().length === 0 ||
    !Array.isArray(value.mapped) ||
    !Array.isArray(value.unmapped)
  ) {
    return { status: "invalid", code: "invalid-manifest" };
  }

  const mapped = value.mapped.map((fixture) => {
    if (
      !isRecord(fixture) ||
      !hasExactKeys(fixture, ["label", "managed", "identity", "target"]) ||
      typeof fixture.label !== "string" ||
      fixture.label.trim().length === 0 ||
      typeof fixture.managed !== "boolean"
    ) {
      return null;
    }
    const identity = parseIdentity(fixture.identity);
    const target = parseTarget(fixture.target);
    return identity && target
      ? { label: fixture.label, managed: fixture.managed, identity, target }
      : null;
  });
  const unmapped = value.unmapped.map((fixture) => {
    if (
      !isRecord(fixture) ||
      !hasExactKeys(fixture, ["label", "identity"]) ||
      typeof fixture.label !== "string" ||
      fixture.label.trim().length === 0
    ) {
      return null;
    }
    const identity = parseIdentity(fixture.identity);
    return identity ? { label: fixture.label, identity } : null;
  });
  if (
    mapped.some((fixture) => fixture === null) ||
    unmapped.some((fixture) => fixture === null)
  ) {
    return { status: "invalid", code: "invalid-fixture" };
  }

  const fixtures = [
    ...(mapped as CampusMapProviderMappingQaManifest["mapped"]),
    ...(unmapped as CampusMapProviderMappingQaManifest["unmapped"]),
  ];
  if (fixtures.some(({ identity }) => identity.provider !== "amap")) {
    return { status: "invalid", code: "non-amap-provider" };
  }
  const labels = fixtures.map(({ label }) => label);
  const identities = fixtures.map(({ identity }) =>
    campusMapProviderIdentityKey(identity),
  );
  if (
    new Set(labels).size !== labels.length ||
    new Set(identities).size !== identities.length
  ) {
    return { status: "invalid", code: "duplicate-fixture" };
  }
  if (
    !mapped.some((fixture) => fixture?.target.kind === "building") ||
    !mapped.some((fixture) => fixture?.target.kind === "place") ||
    unmapped.length === 0
  ) {
    return { status: "invalid", code: "missing-required-role" };
  }

  return {
    status: "valid",
    manifest: {
      version: 1,
      provenanceId: value.provenanceId,
      reason: value.reason,
      mapped: mapped as CampusMapProviderMappingQaManifest["mapped"],
      unmapped: unmapped as CampusMapProviderMappingQaManifest["unmapped"],
    },
  };
}

function resultCode(result: CampusMapProviderMappingCommandResult) {
  if (result.status === "mapped") return `unexpected-${result.outcome}`;
  if (result.status === "validation-failed") {
    return result.errors[0]?.code ?? "validation-failed";
  }
  return result.code;
}

async function readActiveTarget(
  identity: CampusMapProviderIdentity,
  ports: CampusMapProviderMappingQaPorts,
): Promise<
  | { status: "ok"; target: CampusMapProviderMappingTarget | null }
  | { status: "failed"; code: string }
> {
  const governance = await ports.governance(identity);
  if (governance.status === "ok") {
    return { status: "ok", target: governance.activeTarget };
  }
  return {
    status: "failed",
    code:
      governance.status === "validation-failed"
        ? (governance.errors[0]?.code ?? "validation-failed")
        : governance.code,
  };
}

export async function runCampusMapProviderMappingQaFixtures(
  manifest: CampusMapProviderMappingQaManifest,
  action: CampusMapProviderMappingQaAction,
  ports: CampusMapProviderMappingQaPorts,
): Promise<CampusMapProviderMappingQaResult> {
  const currentTargets = new Map<
    string,
    CampusMapProviderMappingTarget | null
  >();
  const expectations = [
    ...manifest.mapped.map((fixture) => ({
      ...fixture,
      role: "mapped" as const,
      expectedTarget: fixture.target,
    })),
    ...manifest.unmapped.map((fixture) => ({
      ...fixture,
      role: "transient" as const,
      expectedTarget: null,
    })),
  ];
  for (const fixture of expectations) {
    const active = await readActiveTarget(fixture.identity, ports);
    if (active.status === "failed") {
      return {
        status: "failed",
        stage: "preflight",
        label: fixture.label,
        code: active.code,
      };
    }
    if (
      active.target !== null &&
      (fixture.expectedTarget === null ||
        !sameCampusMapProviderMappingTarget(
          active.target,
          fixture.expectedTarget,
        ))
    ) {
      return {
        status: "failed",
        stage: "preflight",
        label: fixture.label,
        code:
          fixture.role === "transient"
            ? "expected-transient-provider-object"
            : "different-active-target",
      };
    }
    if (
      fixture.role === "mapped" &&
      !fixture.managed &&
      active.target === null
    ) {
      return {
        status: "failed",
        stage: "preflight",
        label: fixture.label,
        code: "expected-existing-target",
      };
    }
    currentTargets.set(
      campusMapProviderIdentityKey(fixture.identity),
      active.target,
    );
  }

  let changed = 0;
  for (const fixture of manifest.mapped) {
    const current =
      currentTargets.get(campusMapProviderIdentityKey(fixture.identity)) ??
      null;
    const command =
      fixture.managed && action === "apply" && current === null
        ? ({
            kind: "bind",
            idempotencyKey: randomUUID(),
            identity: fixture.identity,
            target: fixture.target,
            reason: manifest.reason,
            provenanceId: manifest.provenanceId,
          } satisfies CampusMapProviderMappingCommand)
        : fixture.managed && action === "cleanup" && current !== null
          ? ({
              kind: "unlink",
              idempotencyKey: randomUUID(),
              identity: fixture.identity,
              previousTarget: fixture.target,
              reason: manifest.reason,
              provenanceId: manifest.provenanceId,
            } satisfies CampusMapProviderMappingCommand)
          : null;
    if (!command) continue;
    const result = await ports.command(command);
    if (
      result.status !== "mapped" ||
      (command.kind === "bind" &&
        result.outcome !== "bound" &&
        result.outcome !== "unchanged") ||
      (command.kind === "unlink" && result.outcome !== "unlinked")
    ) {
      return {
        status: "failed",
        stage: "command",
        label: fixture.label,
        code: resultCode(result),
      };
    }
    if (result.outcome !== "unchanged") changed += 1;
  }

  for (const fixture of expectations) {
    const resolved = await ports.resolve(fixture.identity);
    const expected =
      fixture.role === "transient" || (action === "cleanup" && fixture.managed)
        ? null
        : fixture.expectedTarget;
    if (!sameCampusMapProviderMappingTarget(resolved, expected)) {
      return {
        status: "failed",
        stage: "verify",
        label: fixture.label,
        code:
          fixture.role === "transient"
            ? "expected-transient-provider-object"
            : "unexpected-public-target",
      };
    }
  }

  return {
    status: "ok",
    action,
    changed,
    verified: manifest.mapped.length + manifest.unmapped.length,
  };
}
