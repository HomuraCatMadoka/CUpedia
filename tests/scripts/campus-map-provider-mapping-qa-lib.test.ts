import { randomUUID } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  parseCampusMapProviderMappingQaManifest,
  runCampusMapProviderMappingQaFixtures,
  type CampusMapProviderMappingQaPorts,
} from "../../scripts/campus-map-provider-mapping-qa-lib";
import type {
  CampusMapProviderIdentity,
  CampusMapProviderMappingTarget,
} from "@/lib/campus-map/provider-mapping-registry";

const provenanceId = randomUUID();
const buildingId = randomUUID();
const placeId = randomUUID();
const otherBuildingId = randomUUID();

const manifest = {
  version: 1 as const,
  provenanceId,
  reason: "Verify the fixed Campus Map QA worktree",
  mapped: [
    {
      label: "building",
      managed: true,
      identity: { provider: "amap", providerObjectId: "building-poi" },
      target: { kind: "building" as const, buildingId },
    },
    {
      label: "place",
      managed: true,
      identity: { provider: "amap", providerObjectId: "place-poi" },
      target: { kind: "place" as const, placeId },
    },
  ],
  unmapped: [
    {
      label: "transient",
      identity: { provider: "amap", providerObjectId: "unmapped-poi" },
    },
  ],
};

function identityKey(identity: CampusMapProviderIdentity) {
  return `${identity.provider}:${identity.providerObjectId}`;
}

function sameTarget(
  left: CampusMapProviderMappingTarget | null,
  right: CampusMapProviderMappingTarget | null,
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function harness(
  initial: Array<
    readonly [CampusMapProviderIdentity, CampusMapProviderMappingTarget]
  > = [],
) {
  const active = new Map(
    initial.map(([identity, target]) => [identityKey(identity), target]),
  );
  const command: CampusMapProviderMappingQaPorts["command"] = vi.fn(
    async (input) => {
      const key = identityKey(input.identity);
      const previousTarget = active.get(key) ?? null;
      if (input.kind === "bind") active.set(key, input.target);
      if (input.kind === "unlink") active.delete(key);
      return {
        status: "mapped" as const,
        outcome:
          input.kind === "bind"
            ? previousTarget
              ? ("unchanged" as const)
              : ("bound" as const)
            : ("unlinked" as const),
        identity: input.identity,
        previousTarget,
        target: input.kind === "bind" ? input.target : null,
        eventId: randomUUID(),
      };
    },
  );
  const ports: CampusMapProviderMappingQaPorts = {
    command,
    governance: vi.fn(async (identity) => ({
      status: "ok" as const,
      identity,
      activeTarget: active.get(identityKey(identity)) ?? null,
      events: [],
    })),
    resolve: vi.fn(
      async (identity) => active.get(identityKey(identity)) ?? null,
    ),
  };
  return { active, command, ports };
}

describe("Campus Map provider mapping QA fixtures", () => {
  it("requires mapped Building, mapped Place, and unmapped provider fixtures", () => {
    expect(parseCampusMapProviderMappingQaManifest(manifest)).toEqual({
      status: "valid",
      manifest,
    });
    expect(
      parseCampusMapProviderMappingQaManifest({
        ...manifest,
        mapped: manifest.mapped.slice(1),
      }),
    ).toMatchObject({ status: "invalid" });
  });

  it("rejects fixtures from providers other than AMap", () => {
    expect(
      parseCampusMapProviderMappingQaManifest({
        ...manifest,
        unmapped: [
          {
            ...manifest.unmapped[0],
            identity: {
              provider: "fake",
              providerObjectId: "unmapped-poi",
            },
          },
        ],
      }),
    ).toEqual({ status: "invalid", code: "non-amap-provider" });
  });

  it("uses the registry identity rules when parsing fixtures", () => {
    expect(
      parseCampusMapProviderMappingQaManifest({
        ...manifest,
        mapped: [
          {
            ...manifest.mapped[0],
            identity: {
              provider: "AMAP",
              providerObjectId: " building-poi ",
            },
          },
          manifest.mapped[1],
        ],
      }),
    ).toEqual({ status: "invalid", code: "invalid-fixture" });
  });

  it("canonicalizes target UUIDs exactly like the registry", () => {
    const parsed = parseCampusMapProviderMappingQaManifest({
      ...manifest,
      mapped: [
        {
          ...manifest.mapped[0],
          target: {
            kind: "building",
            buildingId: buildingId.toUpperCase(),
          },
        },
        manifest.mapped[1],
      ],
    });

    expect(parsed.status).toBe("valid");
    if (parsed.status === "valid") {
      expect(parsed.manifest.mapped[0].target).toEqual({
        kind: "building",
        buildingId,
      });
    }
  });

  it("preserves an existing mapping that the QA fixture does not own", async () => {
    const parsed = parseCampusMapProviderMappingQaManifest({
      ...manifest,
      mapped: manifest.mapped.map((fixture, index) => ({
        ...fixture,
        managed: index === 0,
      })),
    });
    expect(parsed.status).toBe("valid");
    if (parsed.status !== "valid") return;
    const runtime = harness(
      parsed.manifest.mapped.map(
        ({ identity, target }) => [identity, target] as const,
      ),
    );

    const result = await runCampusMapProviderMappingQaFixtures(
      parsed.manifest,
      "cleanup",
      runtime.ports,
    );

    expect(result).toMatchObject({ status: "ok", changed: 1, verified: 3 });
    expect(runtime.command).toHaveBeenCalledTimes(1);
    expect(
      runtime.active.get(identityKey(parsed.manifest.mapped[1].identity)),
    ).toEqual(parsed.manifest.mapped[1].target);
  });

  it("applies missing mappings through formal bind commands and verifies all roles", async () => {
    const runtime = harness();

    const result = await runCampusMapProviderMappingQaFixtures(
      manifest,
      "apply",
      runtime.ports,
    );

    expect(result).toEqual({
      status: "ok",
      action: "apply",
      changed: 2,
      verified: 3,
    });
    expect(runtime.command).toHaveBeenCalledTimes(2);
    expect(
      vi.mocked(runtime.command).mock.calls.map(([command]) => command.kind),
    ).toEqual(["bind", "bind"]);
  });

  it("fails closed before writing when an identity has a different active target", async () => {
    const runtime = harness([
      [
        manifest.mapped[0].identity,
        { kind: "building", buildingId: otherBuildingId },
      ],
    ]);

    const result = await runCampusMapProviderMappingQaFixtures(
      manifest,
      "apply",
      runtime.ports,
    );

    expect(result).toMatchObject({
      status: "failed",
      stage: "preflight",
      label: "building",
      code: "different-active-target",
    });
    expect(runtime.command).not.toHaveBeenCalled();
  });

  it("fails closed before writing when the transient fixture is already mapped", async () => {
    const runtime = harness([
      [
        manifest.unmapped[0].identity,
        { kind: "building", buildingId: otherBuildingId },
      ],
    ]);

    const result = await runCampusMapProviderMappingQaFixtures(
      manifest,
      "apply",
      runtime.ports,
    );

    expect(result).toMatchObject({
      status: "failed",
      stage: "preflight",
      label: "transient",
      code: "expected-transient-provider-object",
    });
    expect(runtime.command).not.toHaveBeenCalled();
  });

  it("does not mistake a non-public active mapping for an unmapped fixture", async () => {
    const runtime = harness([
      [manifest.unmapped[0].identity, { kind: "place", placeId: randomUUID() }],
    ]);
    vi.mocked(runtime.ports.resolve).mockResolvedValue(null);

    const result = await runCampusMapProviderMappingQaFixtures(
      manifest,
      "verify",
      runtime.ports,
    );

    expect(result).toMatchObject({
      status: "failed",
      stage: "preflight",
      label: "transient",
      code: "expected-transient-provider-object",
    });
  });

  it("cleans up only the exact fixtures through formal unlink commands", async () => {
    const runtime = harness(
      manifest.mapped.map(
        ({ identity, target }) => [identity, target] as const,
      ),
    );

    const result = await runCampusMapProviderMappingQaFixtures(
      manifest,
      "cleanup",
      runtime.ports,
    );

    expect(result).toEqual({
      status: "ok",
      action: "cleanup",
      changed: 2,
      verified: 3,
    });
    expect(runtime.command).toHaveBeenCalledTimes(2);
    expect(
      vi
        .mocked(runtime.command)
        .mock.calls.every(([command]) => command.kind === "unlink"),
    ).toBe(true);
    expect(
      manifest.mapped.every(({ identity }) =>
        sameTarget(runtime.active.get(identityKey(identity)) ?? null, null),
      ),
    ).toBe(true);
  });
});
