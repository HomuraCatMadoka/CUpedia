import { describe, expect, it } from "vitest";
import {
  buildMenuIdentityTransitionAudit as buildTransitionAudit,
  fingerprintMenuIdentityTransitionSource,
  parseMenuIdentityTransitionArtifact,
  verifyMenuIdentityTransitionArtifact as verifyTransitionArtifact,
} from "@/lib/canteen-menu-identity-transition";
import type { ExistingSyncMenuItem } from "@/lib/canteen-menu-sync";
import type {
  MenuSnapshotCompleteness,
  MenuSyncItemInput,
} from "@/lib/canteen-types";
import transitionFixture from "./fixtures/canteen-menu-identity-transition-v3.json";

function buildMenuIdentityTransitionAudit(
  existingItems: readonly ExistingSyncMenuItem[],
  incomingItems: readonly MenuSyncItemInput[],
  snapshotCompleteness: MenuSnapshotCompleteness = "complete",
) {
  return buildTransitionAudit(existingItems, {
    snapshotCompleteness,
    items: [...incomingItems],
  });
}

function verifyMenuIdentityTransitionArtifact(
  source: Parameters<typeof verifyTransitionArtifact>[0],
  existingItems: Parameters<typeof verifyTransitionArtifact>[1],
  incomingItems: readonly MenuSyncItemInput[],
  artifact: unknown,
  snapshotCompleteness: MenuSnapshotCompleteness = "complete",
) {
  return verifyTransitionArtifact(
    source,
    existingItems,
    { snapshotCompleteness, items: [...incomingItems] },
    artifact,
  );
}

function existing(
  overrides: Partial<ExistingSyncMenuItem> = {},
): ExistingSyncMenuItem {
  return {
    id: "11111111-1111-4111-a111-111111111111",
    name: "  凍奶茶 ",
    mealPeriods: ["lunch"],
    sortOrder: 0,
    svgKey: "drink",
    priceOptions: [
      { label: null, amountMinor: 1_500, currency: "HKD", sortOrder: 0 },
    ],
    menuSourceId: "22222222-2222-4222-a222-222222222222",
    externalProductId: "old-product-id",
    isAvailable: true,
    ...overrides,
  };
}

function incoming(
  overrides: Partial<MenuSyncItemInput> = {},
): MenuSyncItemInput {
  return {
    externalProductId: "new-product-id",
    name: "凍奶茶",
    mealPeriods: ["lunch"],
    sortOrder: 9,
    svgKey: "beverage",
    priceOptions: [
      { label: null, amountMinor: 1_500, currency: "HKD", sortOrder: 0 },
    ],
    ...overrides,
  };
}

describe("menu identity transition audit", () => {
  it("records one unambiguous identity replacement with review evidence", () => {
    const audit = buildMenuIdentityTransitionAudit([existing()], [incoming()]);

    expect(audit.replacementCandidates).toEqual([
      {
        itemId: "11111111-1111-4111-a111-111111111111",
        previous: {
          externalProductId: "old-product-id",
          normalizedName: "凍奶茶",
          mealPeriods: ["lunch"],
          priceOptions: [
            {
              label: null,
              amountMinor: 1_500,
              currency: "HKD",
              sortOrder: 0,
            },
          ],
        },
        next: {
          externalProductId: "new-product-id",
          normalizedName: "凍奶茶",
          mealPeriods: ["lunch"],
          priceOptions: [
            {
              label: null,
              amountMinor: 1_500,
              currency: "HKD",
              sortOrder: 0,
            },
          ],
        },
      },
    ]);
    expect(audit.additions).toEqual([]);
    expect(audit.removals).toEqual([]);
    expect(audit.ambiguities).toEqual([]);
    expect(audit.summary).toEqual({
      existingCount: 1,
      incomingCount: 1,
      missingIdentityCount: 1,
      newIdentityCount: 1,
      replacementCandidateCount: 1,
      additionCount: 0,
      removalCount: 0,
      ambiguityCount: 0,
    });
    expect(audit.existingFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(audit.incomingFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when the same evidence can describe a split or merge", () => {
    const audit = buildMenuIdentityTransitionAudit(
      [
        existing(),
        existing({
          id: "33333333-3333-4333-a333-333333333333",
          externalProductId: "second-old-id",
        }),
      ],
      [incoming()],
    );

    expect(audit.replacementCandidates).toEqual([]);
    expect(audit.additions).toEqual([]);
    expect(audit.removals).toEqual([]);
    expect(audit.ambiguities).toEqual([
      expect.objectContaining({
        normalizedName: "凍奶茶",
        previous: [
          expect.objectContaining({
            itemId: "11111111-1111-4111-a111-111111111111",
          }),
          expect.objectContaining({
            itemId: "33333333-3333-4333-a333-333333333333",
          }),
        ],
        next: [
          expect.objectContaining({ externalProductId: "new-product-id" }),
        ],
      }),
    ]);
  });

  it("fails closed on a same-name split or merge when mutable evidence changed", () => {
    const audit = buildMenuIdentityTransitionAudit(
      [
        existing(),
        existing({
          id: "33333333-3333-4333-a333-333333333333",
          externalProductId: "second-old-id",
          priceOptions: [
            { label: null, amountMinor: 1_700, currency: "HKD", sortOrder: 0 },
          ],
        }),
      ],
      [
        incoming({
          priceOptions: [
            { label: null, amountMinor: 1_600, currency: "HKD", sortOrder: 0 },
          ],
        }),
      ],
    );

    expect(audit).toMatchObject({
      summary: {
        missingIdentityCount: 2,
        newIdentityCount: 1,
        ambiguityCount: 1,
      },
      replacementCandidates: [],
      additions: [],
      removals: [],
    });
    expect(audit.ambiguities[0]).toMatchObject({
      normalizedName: "凍奶茶",
      previous: expect.arrayContaining([
        expect.objectContaining({ itemId: existing().id }),
        expect.objectContaining({
          itemId: "33333333-3333-4333-a333-333333333333",
        }),
      ]),
      next: [expect.objectContaining({ externalProductId: "new-product-id" })],
    });
  });

  it("is deterministic and separates reviewed additions from removals", () => {
    const oldItems = [
      existing({
        id: "44444444-4444-4444-a444-444444444444",
        externalProductId: "removed-b",
        name: "沙嗲",
      }),
      existing({
        id: "33333333-3333-4333-a333-333333333333",
        externalProductId: "removed-a",
        name: "咖啡",
      }),
    ];
    const newItems = [
      incoming({ externalProductId: "added-b", name: "檸茶" }),
      incoming({ externalProductId: "added-a", name: "可樂" }),
    ];

    const forward = buildMenuIdentityTransitionAudit(oldItems, newItems);
    const reversed = buildMenuIdentityTransitionAudit(
      [...oldItems].reverse(),
      [...newItems].reverse(),
    );

    expect(reversed).toEqual(forward);
    expect(forward.additions.map((item) => item.externalProductId)).toEqual([
      "added-a",
      "added-b",
    ]);
    expect(
      forward.removals.map((item) => item.evidence.externalProductId),
    ).toEqual(["removed-a", "removed-b"]);
  });

  it("bounds the review artifact before materializing an oversized diff", () => {
    const oversized = Array.from({ length: 501 }, (_, index) =>
      incoming({
        externalProductId: `product-${index}`,
        name: `菜品 ${index}`,
      }),
    );

    expect(() => buildMenuIdentityTransitionAudit([], oversized)).toThrow(
      "MENU_IDENTITY_TRANSITION_TOO_LARGE",
    );
  });

  it("fingerprints every mutable field even when review evidence is unchanged", () => {
    const baseline = buildMenuIdentityTransitionAudit(
      [existing()],
      [incoming()],
    );
    const changedPresentation = buildMenuIdentityTransitionAudit(
      [existing()],
      [incoming({ sortOrder: 10, svgKey: "tea" })],
    );

    expect(changedPresentation.replacementCandidates).toEqual(
      baseline.replacementCandidates,
    );
    expect(changedPresentation.incomingFingerprint).not.toBe(
      baseline.incomingFingerprint,
    );
  });

  it("accepts an explicit reviewed mapping when mutable evidence changed", () => {
    const previous = existing();
    const next = incoming({
      priceOptions: [
        { label: null, amountMinor: 1_600, currency: "HKD", sortOrder: 0 },
      ],
    });
    const audit = buildMenuIdentityTransitionAudit([previous], [next]);

    expect(audit.replacementCandidates).toEqual([
      expect.objectContaining({
        itemId: previous.id,
        previous: expect.objectContaining({
          externalProductId: previous.externalProductId,
        }),
        next: expect.objectContaining({
          externalProductId: next.externalProductId,
        }),
      }),
    ]);
    expect(
      verifyMenuIdentityTransitionArtifact(
        {
          provider: "aigens",
          externalOwnerId: null,
          externalStoreId: "102830",
          configurationFingerprint: "a".repeat(64),
        },
        [previous],
        [next],
        {
          schemaVersion: 3,
          source: {
            provider: "aigens",
            externalOwnerId: null,
            externalStoreId: "102830",
            configurationFingerprint: "a".repeat(64),
          },
          audit,
          decisions: {
            snapshotScope: {
              status: "complete",
              rationale:
                "The provider response contains the complete store menu.",
            },
            replacements: [
              {
                itemId: previous.id,
                previousProductId: previous.externalProductId!,
                nextProductId: next.externalProductId,
                rationale:
                  "Provider listing and operator evidence confirm the same dish.",
              },
            ],
            additions: [],
            removals: [],
            ambiguities: [],
          },
        },
      ),
    ).toEqual([
      {
        itemId: previous.id,
        previousProductId: previous.externalProductId,
        nextProductId: next.externalProductId,
      },
    ]);
  });

  it("rejects an artifact that does not classify the complete diff", () => {
    const previous = existing();
    const next = incoming();
    const audit = buildMenuIdentityTransitionAudit([previous], [next]);

    expect(() =>
      verifyMenuIdentityTransitionArtifact(
        {
          provider: "aigens",
          externalOwnerId: null,
          externalStoreId: "102830",
          configurationFingerprint: "a".repeat(64),
        },
        [previous],
        [next],
        {
          schemaVersion: 3,
          source: {
            provider: "aigens",
            externalOwnerId: null,
            externalStoreId: "102830",
            configurationFingerprint: "a".repeat(64),
          },
          audit,
          decisions: {
            snapshotScope: {
              status: "complete",
              rationale:
                "The provider response contains the complete store menu.",
            },
            replacements: [],
            additions: [],
            removals: [],
            ambiguities: [],
          },
        },
      ),
    ).toThrow("MENU_IDENTITY_TRANSITION_INCOMPLETE_DECISIONS");
  });

  it("rejects an unreviewed or incomplete provider snapshot scope", () => {
    const previous = existing();
    const next = incoming();
    const audit = buildMenuIdentityTransitionAudit([previous], [next]);

    expect(() =>
      verifyMenuIdentityTransitionArtifact(
        {
          provider: "aigens",
          externalOwnerId: null,
          externalStoreId: "102830",
          configurationFingerprint: "a".repeat(64),
        },
        [previous],
        [next],
        {
          schemaVersion: 3,
          source: {
            provider: "aigens",
            externalOwnerId: null,
            externalStoreId: "102830",
            configurationFingerprint: "a".repeat(64),
          },
          audit,
          decisions: {
            snapshotScope: {
              status: "wrong-or-incomplete",
              rationale: "The response omitted a known menu period.",
            },
            replacements: [],
            additions: [],
            removals: [],
            ambiguities: [],
          },
        },
      ),
    ).toThrow("MENU_IDENTITY_TRANSITION_SCOPE_REJECTED");
  });

  it("records a reviewer-identified split or merge as non-executable", () => {
    const previous = existing();
    const next = incoming({ name: "奶茶新款" });
    const audit = buildMenuIdentityTransitionAudit([previous], [next]);
    expect(audit.ambiguities).toEqual([]);

    expect(() =>
      verifyMenuIdentityTransitionArtifact(
        {
          provider: "aigens",
          externalOwnerId: null,
          externalStoreId: "102830",
          configurationFingerprint: "a".repeat(64),
        },
        [previous],
        [next],
        {
          schemaVersion: 3,
          source: {
            provider: "aigens",
            externalOwnerId: null,
            externalStoreId: "102830",
            configurationFingerprint: "a".repeat(64),
          },
          audit,
          decisions: {
            snapshotScope: {
              status: "complete",
              rationale:
                "The provider response contains the complete store menu.",
            },
            replacements: [],
            additions: [],
            removals: [],
            ambiguities: [
              {
                previousProductIds: [previous.externalProductId!],
                nextProductIds: [next.externalProductId],
                rationale:
                  "The renamed listing may represent a split or merge.",
              },
            ],
          },
        },
      ),
    ).toThrow("MENU_IDENTITY_TRANSITION_AMBIGUOUS");
  });

  it("rejects malformed artifact JSON with a stable boundary error", () => {
    expect(() =>
      verifyMenuIdentityTransitionArtifact(
        {
          provider: "aigens",
          externalOwnerId: null,
          externalStoreId: "102830",
          configurationFingerprint: "a".repeat(64),
        },
        [existing()],
        [incoming()],
        null as never,
      ),
    ).toThrow("INVALID_MENU_IDENTITY_TRANSITION_ARTIFACT");
  });

  it("binds approval to the complete menu source configuration", () => {
    const source = {
      id: "22222222-2222-4222-a222-222222222222",
      canteenId: "33333333-3333-4333-a333-333333333333",
      provider: "pinme" as const,
      externalOwnerId: null,
      externalStoreId: "4898",
      config: { locale: "zh-HK", nested: { mode: "public" } },
      enabled: true,
      legacyTakeoverAt: null,
    };

    expect(
      fingerprintMenuIdentityTransitionSource({
        ...source,
        config: { nested: { mode: "public" }, locale: "zh-HK" },
      }),
    ).toBe(fingerprintMenuIdentityTransitionSource(source));
    expect(
      fingerprintMenuIdentityTransitionSource({
        ...source,
        config: { locale: "en", nested: { mode: "public" } },
      }),
    ).not.toBe(fingerprintMenuIdentityTransitionSource(source));
  });

  it("replays the versioned reviewed artifact fixture", () => {
    const artifact = parseMenuIdentityTransitionArtifact(transitionFixture);
    expect(
      verifyMenuIdentityTransitionArtifact(
        artifact.source,
        [
          existing({
            id: "11111111-1111-4111-a111-111111111111",
            name: "凍奶茶",
            menuSourceId: "22222222-2222-4222-a222-222222222222",
          }),
        ],
        [incoming({ sortOrder: 0, svgKey: "drink" })],
        artifact,
      ),
    ).toEqual([
      {
        itemId: "11111111-1111-4111-a111-111111111111",
        previousProductId: "old-product-id",
        nextProductId: "new-product-id",
      },
    ]);
  });

  it("rejects completeness that contradicts the reviewed provider", () => {
    const artifact = parseMenuIdentityTransitionArtifact(transitionFixture);

    expect(() =>
      verifyMenuIdentityTransitionArtifact(
        artifact.source,
        [
          existing({
            id: "11111111-1111-4111-a111-111111111111",
            name: "凍奶茶",
            menuSourceId: "22222222-2222-4222-a222-222222222222",
          }),
        ],
        [incoming({ sortOrder: 0, svgKey: "drink" })],
        artifact,
        "partial",
      ),
    ).toThrow("MENU_SNAPSHOT_COMPLETENESS_MISMATCH");
  });

  it("rejects promoting a partial PinMe snapshot to complete", () => {
    const previous = existing();
    const next = incoming();
    const audit = buildMenuIdentityTransitionAudit([previous], [next]);

    expect(() =>
      verifyMenuIdentityTransitionArtifact(
        {
          provider: "pinme",
          externalOwnerId: null,
          externalStoreId: "4898",
          configurationFingerprint: "a".repeat(64),
        },
        [previous],
        [next],
        {
          schemaVersion: 3,
          source: {
            provider: "pinme",
            externalOwnerId: null,
            externalStoreId: "4898",
            configurationFingerprint: "a".repeat(64),
          },
          audit,
          decisions: {
            snapshotScope: {
              status: "complete",
              rationale: "Reviewer claimed a complete catalog.",
            },
            replacements: [],
            additions: [],
            removals: [],
            ambiguities: [],
          },
        },
      ),
    ).toThrow("MENU_SNAPSHOT_COMPLETENESS_MISMATCH");
  });

  it("ignores JSON object key order when verifying audit facts", () => {
    const previous = existing();
    const next = incoming();
    const audit = buildMenuIdentityTransitionAudit([previous], [next]);
    const reorderedAudit = {
      snapshotCompleteness: audit.snapshotCompleteness,
      ambiguities: audit.ambiguities,
      removals: audit.removals,
      additions: audit.additions,
      replacementCandidates: audit.replacementCandidates,
      incomingFingerprint: audit.incomingFingerprint,
      existingFingerprint: audit.existingFingerprint,
      summary: audit.summary,
    };

    expect(
      verifyMenuIdentityTransitionArtifact(
        {
          provider: "aigens",
          externalOwnerId: null,
          externalStoreId: "102830",
          configurationFingerprint: "a".repeat(64),
        },
        [previous],
        [next],
        {
          schemaVersion: 3,
          source: {
            provider: "aigens",
            externalOwnerId: null,
            externalStoreId: "102830",
            configurationFingerprint: "a".repeat(64),
          },
          audit: reorderedAudit,
          decisions: {
            snapshotScope: {
              status: "complete",
              rationale:
                "The provider response contains the complete store menu.",
            },
            replacements: [
              {
                itemId: previous.id,
                previousProductId: previous.externalProductId!,
                nextProductId: next.externalProductId,
                rationale: "Same normalized name, price, and meal period.",
              },
            ],
            additions: [],
            removals: [],
            ambiguities: [],
          },
        },
      ),
    ).toHaveLength(1);
  });

  it("does not classify an exact inactive identity as a new addition", () => {
    const audit = buildMenuIdentityTransitionAudit(
      [
        existing({
          externalProductId: "returning-product",
          isAvailable: false,
        }),
      ],
      [incoming({ externalProductId: "returning-product" })],
    );

    expect(audit.summary).toMatchObject({
      existingCount: 0,
      incomingCount: 1,
      additionCount: 0,
    });
    expect(audit.additions).toEqual([]);
    expect(audit.removals).toEqual([]);
  });

  it("can preserve an inactive UUID when the provider identity changes", () => {
    const audit = buildMenuIdentityTransitionAudit(
      [existing({ isAvailable: false })],
      [incoming()],
    );

    expect(audit.summary).toMatchObject({
      existingCount: 0,
      replacementCandidateCount: 1,
      additionCount: 0,
      removalCount: 0,
    });
    expect(audit.replacementCandidates[0]).toMatchObject({
      itemId: "11111111-1111-4111-a111-111111111111",
      previous: { externalProductId: "old-product-id" },
      next: { externalProductId: "new-product-id" },
    });
  });
});
