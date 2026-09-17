import { randomUUID } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  campusMapProviderMappingReleaseIdempotencyKey,
  parseCampusMapProviderMappingReleaseManifest,
  runCampusMapProviderMappingRelease,
  type CampusMapProviderMappingReleaseManifest,
  type CampusMapProviderMappingReleasePorts,
} from "@/lib/campus-map/provider-mapping-release";
import type {
  CampusMapProviderIdentity,
  CampusMapProviderMappingTarget,
} from "@/lib/campus-map/provider-mapping-domain";

const buildingId = randomUUID();
const existingBuildingId = randomUUID();
const otherBuildingId = randomUUID();
const provenanceId = randomUUID();
const existingProvenanceId = randomUUID();
const auditActorId = randomUUID();

const manifest = {
  schemaVersion: "cuhk-campus-map-provider-mapping-release/2" as const,
  manifestVersion: "2026-09-17.3",
  accessedOn: "2026-09-17",
  approval: {
    status: "approved" as const,
    reviewedBy: "Independent agent review",
    reviewedOn: "2026-09-17",
  },
  reason: "Issue #767 reviewed exact AMap hotspot mappings.",
  mappings: [
    {
      label: "YIA",
      identity: { provider: "amap", providerObjectId: "B0FFFS94ZL" },
      target: { kind: "building" as const, buildingId },
      evidence: {
        providerLabel: "康本国际学术园",
        verificationMethod: "real-amap-sdk-hotspotclick" as const,
        observedAt: "2026-09-17T14:44:07+08:00",
        note: "The live hotspot emitted the complete exact provider ID.",
      },
      provenance: {
        sourceRef: "amap:poi:B0FFFS94ZL:hotspotclick:2026-09-17",
        sourceOwner: "AutoNavi",
        sourceVersion: "AMap JavaScript API 2.0 live hotspot",
        accessedOn: "2026-09-17",
        observedAt: "2026-09-17T14:44:07+08:00",
        rightsStatus: "restricted" as const,
        limitations: "Foreign identity evidence only.",
        note: "Reviewed against the existing canonical Building.",
      },
    },
  ],
  verifyExisting: [
    {
      label: "Science Centre",
      identity: { provider: "amap", providerObjectId: "B0J2RXUQB6" },
      target: { kind: "building" as const, buildingId: existingBuildingId },
      evidence: {
        providerLabel: "ScienceCentre科学馆",
        verificationMethod: "real-amap-sdk-hotspotclick" as const,
        observedAt: "2026-09-17T14:44:07+08:00",
        note: "The current exact ID matches the reviewed existing mapping.",
      },
      provenance: {
        sourceRef: "amap:poi:B0J2RXUQB6:hotspotclick:2026-08-26",
        sourceOwner: "AutoNavi",
        sourceVersion: "AMap JavaScript API",
        accessedOn: "2026-08-26",
        observedAt: null,
        rightsStatus: "unknown" as const,
        limitations:
          "Provider label, object ID, and GCJ-02 point are transient evidence; they do not establish canonical identity on their own.",
        note: "Live hotspotclick observed ScienceCentre科学馆 with provider object B0J2RXUQB6; the object was reviewed against the official Science Centre name and nearby official WGS84 anchor, then retained for an explicit audited registry decision.",
      },
    },
  ],
  unresolved: [
    {
      label: "Unresolved point",
      identity: { provider: "amap", providerObjectId: "unresolved-poi" },
      evidence: {
        providerLabel: "Unknown campus point",
        verificationMethod: "real-amap-sdk-hotspotclick" as const,
        observedAt: "2026-09-17T14:44:07+08:00",
        note: "The live point did not have enough canonical evidence.",
      },
      reason: "No unique public canonical target was established.",
    },
  ],
} satisfies CampusMapProviderMappingReleaseManifest;

function identityKey(identity: CampusMapProviderIdentity) {
  return `${identity.provider}:${identity.providerObjectId}`;
}

function harness(
  initial: Array<
    readonly [CampusMapProviderIdentity, CampusMapProviderMappingTarget]
  > = [
    [manifest.verifyExisting[0].identity, manifest.verifyExisting[0].target],
  ],
  options: { withInitialAudit?: boolean } = {},
) {
  const active = new Map(
    initial.map(([identity, target]) => [identityKey(identity), target]),
  );
  const audits = new Map<
    string,
    {
      activeProvenance: {
        id: string;
        kind: string;
        ref: string;
        owner: string | null;
        version: string | null;
        accessedOn: string;
        observedAt: string | null;
        rightsStatus: string;
        limitations: string | null;
        note: string | null;
      };
      latestEvent: {
        kind: "bind" | "unlink" | "rebind";
        newTarget: CampusMapProviderMappingTarget | null;
        actor: { id: string; nickname: string };
        reason: string;
        provenanceId: string;
        occurredAt: string;
      };
    }
  >();
  if (options.withInitialAudit !== false) {
    for (const [identity, target] of initial) {
      const releaseDecision = manifest.mappings.find(
        (decision) => identityKey(decision.identity) === identityKey(identity),
      );
      const decision =
        releaseDecision ??
        manifest.verifyExisting.find(
          (candidate) =>
            identityKey(candidate.identity) === identityKey(identity),
        );
      if (!decision) continue;
      const id = releaseDecision ? provenanceId : existingProvenanceId;
      audits.set(identityKey(identity), {
        activeProvenance: {
          id,
          kind: "provider-candidate",
          ref: decision.provenance.sourceRef,
          owner: decision.provenance.sourceOwner,
          version: decision.provenance.sourceVersion,
          accessedOn: decision.provenance.accessedOn,
          observedAt:
            decision.provenance.observedAt === null
              ? null
              : new Date(decision.provenance.observedAt).toISOString(),
          rightsStatus: decision.provenance.rightsStatus,
          limitations: decision.provenance.limitations,
          note: decision.provenance.note,
        },
        latestEvent: {
          kind: "bind",
          newTarget: target,
          actor: { id: auditActorId, nickname: "Release operator" },
          reason: releaseDecision
            ? `${manifest.reason} ${releaseDecision.label}`
            : "Seed reviewed AMap hotspot mapping for canonical browse cards.",
          provenanceId: id,
          occurredAt: "2026-09-17T08:04:00.000Z",
        },
      });
    }
  }
  const command: CampusMapProviderMappingReleasePorts["command"] = vi.fn(
    async (input) => {
      const previousTarget = active.get(identityKey(input.identity)) ?? null;
      if (input.kind !== "bind") throw new Error("unexpected command");
      active.set(identityKey(input.identity), input.target);
      if (!previousTarget) {
        const releaseDecision = manifest.mappings.find(
          (decision) =>
            identityKey(decision.identity) === identityKey(input.identity),
        );
        audits.set(identityKey(input.identity), {
          activeProvenance: {
            id: input.provenanceId,
            kind: "provider-candidate",
            ref: releaseDecision?.provenance.sourceRef ?? "unexpected-source",
            owner: releaseDecision?.provenance.sourceOwner ?? null,
            version: releaseDecision?.provenance.sourceVersion ?? null,
            accessedOn:
              releaseDecision?.provenance.accessedOn ?? manifest.accessedOn,
            observedAt:
              releaseDecision?.provenance.observedAt === null ||
              !releaseDecision
                ? null
                : new Date(releaseDecision.provenance.observedAt).toISOString(),
            rightsStatus: releaseDecision?.provenance.rightsStatus ?? "unknown",
            limitations: releaseDecision?.provenance.limitations ?? null,
            note: releaseDecision?.provenance.note ?? null,
          },
          latestEvent: {
            kind: "bind",
            newTarget: input.target,
            actor: { id: auditActorId, nickname: "Release operator" },
            reason: input.reason,
            provenanceId: input.provenanceId,
            occurredAt: "2026-09-17T08:04:00.000Z",
          },
        });
      }
      return {
        status: "mapped" as const,
        outcome: previousTarget ? ("unchanged" as const) : ("bound" as const),
        identity: input.identity,
        previousTarget,
        target: input.target,
        eventId: previousTarget ? null : randomUUID(),
      };
    },
  );
  const ports: CampusMapProviderMappingReleasePorts = {
    governance: vi.fn(async (identity) => {
      const audit = audits.get(identityKey(identity));
      return {
        status: "ok" as const,
        activeTarget: active.get(identityKey(identity)) ?? null,
        activeProvenance: audit?.activeProvenance ?? null,
        latestEvent: audit?.latestEvent ?? null,
      };
    }),
    validateTarget: vi.fn(async () => "valid" as const),
    resolveProvenance: vi.fn(async (sources) => ({
      status: "ok" as const,
      provenanceIds: sources.map(() => provenanceId),
    })),
    command,
    resolve: vi.fn(
      async (identity) => active.get(identityKey(identity)) ?? null,
    ),
  };
  return { active, audits, command, ports };
}

describe("Campus Map provider mapping release", () => {
  it("accepts an approved Building-only release with existing and unresolved checks", () => {
    expect(parseCampusMapProviderMappingReleaseManifest(manifest)).toEqual({
      status: "valid",
      manifest,
    });
  });

  it("requires approval and never requires a manufactured Place mapping", () => {
    expect(
      parseCampusMapProviderMappingReleaseManifest({
        ...manifest,
        approval: { ...manifest.approval, status: "pending" },
      }),
    ).toEqual({ status: "invalid", code: "approval-required" });
    expect(
      parseCampusMapProviderMappingReleaseManifest({
        ...manifest,
        mappings: [],
      }),
    ).toEqual({ status: "invalid", code: "building-mapping-required" });
  });

  it("requires review on or after the evidence access date", () => {
    expect(
      parseCampusMapProviderMappingReleaseManifest({
        ...manifest,
        approval: { ...manifest.approval, reviewedOn: "2026-09-16" },
      }),
    ).toEqual({ status: "invalid", code: "approval-required" });
  });

  it("stores the SDK click time as provenance observation time", async () => {
    const runtime = harness();

    await runCampusMapProviderMappingRelease(manifest, "apply", runtime.ports);

    expect(runtime.ports.resolveProvenance).toHaveBeenCalledWith([
      expect.objectContaining({
        observedAt: new Date("2026-09-17T14:44:07+08:00"),
      }),
    ]);
  });

  it("rejects a command reason that would exceed the registry limit", () => {
    expect(
      parseCampusMapProviderMappingReleaseManifest({
        ...manifest,
        reason: "r".repeat(1_990),
        mappings: [{ ...manifest.mappings[0], label: "YIA release" }],
      }),
    ).toEqual({ status: "invalid", code: "mapping-reason-too-large" });
  });

  it("rejects duplicate provider identities across all decisions", () => {
    expect(
      parseCampusMapProviderMappingReleaseManifest({
        ...manifest,
        unresolved: [
          {
            ...manifest.unresolved[0],
            identity: manifest.mappings[0].identity,
          },
        ],
      }),
    ).toEqual({ status: "invalid", code: "duplicate-decision" });
  });

  it("derives a stable canonical idempotency key from the manifest identity", () => {
    const first = campusMapProviderMappingReleaseIdempotencyKey(
      manifest,
      manifest.mappings[0].identity,
    );
    const repeated = campusMapProviderMappingReleaseIdempotencyKey(
      manifest,
      manifest.mappings[0].identity,
    );
    const nextVersion = campusMapProviderMappingReleaseIdempotencyKey(
      { ...manifest, manifestVersion: "2026-09-17.4" },
      manifest.mappings[0].identity,
    );

    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(repeated).toBe(first);
    expect(nextVersion).not.toBe(first);
  });

  it("applies once, verifies every role, and makes the same manifest a zero-write retry", async () => {
    const runtime = harness();

    await expect(
      runCampusMapProviderMappingRelease(manifest, "apply", runtime.ports),
    ).resolves.toEqual({
      status: "ok",
      action: "apply",
      changed: 1,
      verified: 3,
      mappings: 1,
      verifiedExisting: 1,
      unresolved: 1,
    });
    await expect(
      runCampusMapProviderMappingRelease(manifest, "apply", runtime.ports),
    ).resolves.toEqual({
      status: "ok",
      action: "apply",
      changed: 0,
      verified: 3,
      mappings: 1,
      verifiedExisting: 1,
      unresolved: 1,
    });
    expect(runtime.command).toHaveBeenCalledTimes(1);
    expect(runtime.ports.resolveProvenance).toHaveBeenCalledTimes(1);
  });

  it("fails the complete preflight before provenance or mapping writes", async () => {
    const runtime = harness([
      [manifest.verifyExisting[0].identity, manifest.verifyExisting[0].target],
      [
        manifest.unresolved[0].identity,
        { kind: "building", buildingId: otherBuildingId },
      ],
    ]);

    await expect(
      runCampusMapProviderMappingRelease(manifest, "apply", runtime.ports),
    ).resolves.toMatchObject({
      status: "failed",
      stage: "preflight",
      label: "Unresolved point",
      code: "expected-unresolved-provider-object",
    });
    expect(runtime.ports.resolveProvenance).not.toHaveBeenCalled();
    expect(runtime.command).not.toHaveBeenCalled();
  });

  it("fails before provenance when any canonical target is unavailable", async () => {
    const runtime = harness();
    vi.mocked(runtime.ports.validateTarget).mockResolvedValueOnce("not-found");

    await expect(
      runCampusMapProviderMappingRelease(manifest, "apply", runtime.ports),
    ).resolves.toMatchObject({
      status: "failed",
      stage: "preflight",
      label: "YIA",
      code: "mapping-target-not-found",
    });
    expect(runtime.ports.resolveProvenance).not.toHaveBeenCalled();
    expect(runtime.command).not.toHaveBeenCalled();
  });

  it("keeps verify read-only and fails when the reviewed release is absent", async () => {
    const runtime = harness();

    await expect(
      runCampusMapProviderMappingRelease(manifest, "verify", runtime.ports),
    ).resolves.toMatchObject({
      status: "failed",
      stage: "preflight",
      label: "YIA",
      code: "expected-released-target",
    });
    expect(runtime.ports.resolveProvenance).not.toHaveBeenCalled();
    expect(runtime.command).not.toHaveBeenCalled();
  });

  it("rejects an existing release mapping without proof of its formal release audit", async () => {
    const runtime = harness(
      [
        [manifest.mappings[0].identity, manifest.mappings[0].target],
        [
          manifest.verifyExisting[0].identity,
          manifest.verifyExisting[0].target,
        ],
      ],
      { withInitialAudit: false },
    );

    await expect(
      runCampusMapProviderMappingRelease(manifest, "apply", runtime.ports),
    ).resolves.toMatchObject({
      status: "failed",
      stage: "preflight",
      label: "YIA",
      code: "mapping-release-audit-missing",
    });
    expect(runtime.ports.resolveProvenance).not.toHaveBeenCalled();
    expect(runtime.command).not.toHaveBeenCalled();
  });

  it("rejects an existing prerequisite mapping without a lifecycle audit", async () => {
    const runtime = harness(undefined, { withInitialAudit: false });

    await expect(
      runCampusMapProviderMappingRelease(manifest, "apply", runtime.ports),
    ).resolves.toMatchObject({
      status: "failed",
      stage: "preflight",
      label: "Science Centre",
      code: "mapping-audit-missing",
    });
    expect(runtime.ports.resolveProvenance).not.toHaveBeenCalled();
    expect(runtime.command).not.toHaveBeenCalled();
  });

  it("rejects a same-target audit that belongs to a different release", async () => {
    const runtime = harness([
      [manifest.mappings[0].identity, manifest.mappings[0].target],
      [manifest.verifyExisting[0].identity, manifest.verifyExisting[0].target],
    ]);
    const audit = runtime.audits.get(
      identityKey(manifest.mappings[0].identity),
    );
    if (!audit) throw new Error("expected release audit fixture");
    audit.activeProvenance.ref =
      "amap:poi:B0FFFS94ZL:hotspotclick:unrelated-release";

    await expect(
      runCampusMapProviderMappingRelease(manifest, "verify", runtime.ports),
    ).resolves.toMatchObject({
      status: "failed",
      stage: "preflight",
      label: "YIA",
      code: "mapping-release-audit-missing",
    });
  });

  it("rejects release provenance whose observation metadata was changed", async () => {
    const runtime = harness([
      [manifest.mappings[0].identity, manifest.mappings[0].target],
      [manifest.verifyExisting[0].identity, manifest.verifyExisting[0].target],
    ]);
    const audit = runtime.audits.get(
      identityKey(manifest.mappings[0].identity),
    );
    if (!audit) throw new Error("expected release audit fixture");
    audit.activeProvenance.observedAt = "2026-09-17T00:00:00.000Z";

    await expect(
      runCampusMapProviderMappingRelease(manifest, "verify", runtime.ports),
    ).resolves.toMatchObject({
      status: "failed",
      stage: "preflight",
      label: "YIA",
      code: "mapping-release-audit-missing",
    });
  });

  it("rejects an existing mapping whose audit belongs to another provider observation", async () => {
    const runtime = harness([
      [manifest.mappings[0].identity, manifest.mappings[0].target],
      [manifest.verifyExisting[0].identity, manifest.verifyExisting[0].target],
    ]);
    const audit = runtime.audits.get(
      identityKey(manifest.verifyExisting[0].identity),
    );
    if (!audit) throw new Error("expected existing mapping audit fixture");
    audit.activeProvenance.ref =
      "amap:poi:B0J2RXUQB6:hotspotclick:unreviewed-observation";

    await expect(
      runCampusMapProviderMappingRelease(manifest, "verify", runtime.ports),
    ).resolves.toMatchObject({
      status: "failed",
      stage: "preflight",
      label: "Science Centre",
      code: "mapping-audit-missing",
    });
  });
});
