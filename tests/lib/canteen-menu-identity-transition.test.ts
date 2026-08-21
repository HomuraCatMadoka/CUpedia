import { describe, expect, it } from "vitest";
import {
  buildMenuIdentityTransitionAudit as buildTransitionAudit,
  fingerprintMenuIdentityTransitionSource,
  getMenuIdentityTransitionStaleDetails,
  parseMenuIdentityTransitionArtifact,
  verifyMenuIdentityTransitionApproval,
  verifyMenuIdentityTransitionArtifact as verifyTransitionArtifact,
} from "@/lib/canteen-menu-identity-transition";
import type { ExistingSyncMenuItem } from "@/lib/canteen-menu-sync";
import type {
  MenuSnapshotCompleteness,
  MenuSnapshotScopeEvidence,
  MenuSyncItemInput,
} from "@/lib/canteen-types";
import transitionFixture from "./fixtures/canteen-menu-identity-transition-v4.json";

const AIGENS_SCOPE_EVIDENCE: MenuSnapshotScopeEvidence = {
  provider: "aigens",
  externalStoreId: "102830",
  storeName: "Sanitized Aigens store",
  menuName: "Sanitized full catalog",
  providerPeriodCodes: ["B", "D", "L", "T"],
  categoryPeriodCodes: ["B", "D", "L", "T"],
  categoryCount: 2,
  groupCount: 3,
};

function buildMenuIdentityTransitionAudit(
  existingItems: readonly ExistingSyncMenuItem[],
  incomingItems: readonly MenuSyncItemInput[],
  snapshotCompleteness: MenuSnapshotCompleteness = "complete",
) {
  return buildTransitionAudit(existingItems, {
    snapshotCompleteness,
    items: [...incomingItems],
    scopeEvidence: AIGENS_SCOPE_EVIDENCE,
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
    {
      snapshotCompleteness,
      items: [...incomingItems],
      scopeEvidence:
        source.provider === "aigens" ? AIGENS_SCOPE_EVIDENCE : undefined,
    },
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
  it("approves an exact PinMe partial snapshot with addition-only churn", () => {
    const previous = existing({
      externalProductId: "existing-product",
      name: "Existing dish",
    });
    const added = incoming({
      externalProductId: "new-product",
      name: "New dish",
    });
    const input = {
      snapshotCompleteness: "partial" as const,
      items: [added],
    };
    const audit = buildTransitionAudit([previous], input, "pinme");

    expect(audit.summary).toMatchObject({
      additionCount: 1,
      removalCount: 1,
      ambiguityCount: 0,
    });
    expect(
      verifyMenuIdentityTransitionApproval(
        {
          provider: "pinme",
          externalOwnerId: null,
          externalStoreId: "4898",
          configurationFingerprint: "a".repeat(64),
        },
        [previous],
        input,
        {
          schemaVersion: 5,
          source: {
            provider: "pinme",
            externalOwnerId: null,
            externalStoreId: "4898",
            configurationFingerprint: "a".repeat(64),
          },
          audit,
          decisions: {
            replacements: [],
            canonicalizations: [],
            merges: [],
          },
        },
      ),
    ).toEqual({ replacements: [], canonicalizations: [], merges: [] });
  });

  it("approves only identity changes for a partial Aigens observation", () => {
    const visibleAlias = existing({
      externalProductId: "42#offering-period=lunch",
    });
    const absentAlias = existing({
      id: "33333333-3333-4333-a333-333333333333",
      externalProductId: "99#offering-period=dinner",
      name: "熱咖啡",
    });
    const visible = incoming({ externalProductId: "42" });
    const newDish = incoming({
      externalProductId: "77",
      name: "新菜式",
    });
    const input = {
      snapshotCompleteness: "partial" as const,
      scopeEvidence: AIGENS_SCOPE_EVIDENCE,
      items: [visible, newDish],
    };
    const audit = buildTransitionAudit(
      [visibleAlias, absentAlias],
      input,
      "aigens",
    );

    expect(audit.additions.map((item) => item.externalProductId)).toEqual([
      "77",
    ]);
    expect(audit.canonicalizationCandidates).toHaveLength(2);
    expect(
      verifyMenuIdentityTransitionApproval(
        {
          provider: "aigens",
          externalOwnerId: null,
          externalStoreId: "102830",
          configurationFingerprint: "a".repeat(64),
        },
        [visibleAlias, absentAlias],
        input,
        {
          schemaVersion: 5,
          source: {
            provider: "aigens",
            externalOwnerId: null,
            externalStoreId: "102830",
            configurationFingerprint: "a".repeat(64),
          },
          audit,
          decisions: {
            replacements: [],
            canonicalizations: [visibleAlias, absentAlias].map((item) => ({
              itemId: item.id,
              previousProductId: item.externalProductId,
              nextProductId: item.externalProductId!.split("#")[0],
              rationale: "Remove the historical meal-period identity suffix.",
            })),
            merges: [],
          },
        },
      ),
    ).toEqual({
      replacements: [],
      canonicalizations: [
        {
          itemId: visibleAlias.id,
          previousProductId: visibleAlias.externalProductId,
          nextProductId: "42",
        },
        {
          itemId: absentAlias.id,
          previousProductId: absentAlias.externalProductId,
          nextProductId: "99",
        },
      ],
      merges: [],
    });
  });

  it("rejects a partial identity transition with unresolved ambiguity", () => {
    const first = existing();
    const second = existing({
      id: "33333333-3333-4333-a333-333333333333",
      externalProductId: "second-old-id",
    });
    const next = incoming();
    const input = {
      snapshotCompleteness: "partial" as const,
      scopeEvidence: AIGENS_SCOPE_EVIDENCE,
      items: [next],
    };
    const audit = buildTransitionAudit([first, second], input, "aigens");

    expect(() =>
      verifyMenuIdentityTransitionApproval(
        {
          provider: "aigens",
          externalOwnerId: null,
          externalStoreId: "102830",
          configurationFingerprint: "a".repeat(64),
        },
        [first, second],
        input,
        {
          schemaVersion: 5,
          source: {
            provider: "aigens",
            externalOwnerId: null,
            externalStoreId: "102830",
            configurationFingerprint: "a".repeat(64),
          },
          audit,
          decisions: {
            replacements: [],
            canonicalizations: [],
            merges: [],
          },
        },
      ),
    ).toThrow("MENU_IDENTITY_TRANSITION_AMBIGUOUS");
  });

  it("does not let a v5 approval promote an Aigens observation to complete", () => {
    const input = {
      snapshotCompleteness: "complete" as const,
      scopeEvidence: AIGENS_SCOPE_EVIDENCE,
      items: [] as MenuSyncItemInput[],
    };
    const audit = buildTransitionAudit([], input, "aigens");

    expect(() =>
      verifyMenuIdentityTransitionApproval(
        {
          provider: "aigens",
          externalOwnerId: null,
          externalStoreId: "102830",
          configurationFingerprint: "a".repeat(64),
        },
        [],
        input,
        {
          schemaVersion: 5,
          source: {
            provider: "aigens",
            externalOwnerId: null,
            externalStoreId: "102830",
            configurationFingerprint: "a".repeat(64),
          },
          audit,
          decisions: {
            replacements: [],
            canonicalizations: [],
            merges: [],
          },
        },
      ),
    ).toThrow("MENU_SNAPSHOT_COMPLETENESS_MISMATCH");
  });

  it("reports bounded exact-snapshot mismatch facts when verification is stale", () => {
    const previous = existing();
    const next = incoming();
    const audit = buildMenuIdentityTransitionAudit([previous], [next]);
    let thrown: unknown;

    try {
      verifyTransitionArtifact(
        {
          provider: "aigens",
          externalOwnerId: null,
          externalStoreId: "102830",
          configurationFingerprint: "a".repeat(64),
        },
        [previous],
        {
          snapshotCompleteness: "complete",
          items: [next],
          scopeEvidence: { ...AIGENS_SCOPE_EVIDENCE, categoryCount: 3 },
        },
        {
          schemaVersion: 4,
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
              rationale: "The response is the complete provider snapshot.",
            },
            replacements: [],
            canonicalizations: [],
            merges: [],
            additions: [],
            removals: [],
            ambiguities: [],
          },
        },
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe("MENU_IDENTITY_TRANSITION_STALE");
    expect(getMenuIdentityTransitionStaleDetails(thrown)).toEqual({
      existingMatches: true,
      incomingMatches: false,
      currentSummary: expect.objectContaining({
        existingCount: 1,
        incomingCount: 1,
      }),
      currentScope: {
        provider: "aigens",
        categoryCount: 3,
        groupCount: 3,
        providerPeriodCount: 4,
        categoryPeriodCount: 4,
      },
    });
    expect(
      JSON.stringify(getMenuIdentityTransitionStaleDetails(thrown)),
    ).not.toContain("凍奶茶");
  });

  it("records and fingerprints provider scope evidence", () => {
    const scopeEvidence = AIGENS_SCOPE_EVIDENCE;
    const audit = buildTransitionAudit([], {
      snapshotCompleteness: "complete",
      items: [incoming()],
      scopeEvidence,
    });
    const changedScope = buildTransitionAudit([], {
      snapshotCompleteness: "complete",
      items: [incoming()],
      scopeEvidence: { ...scopeEvidence, categoryCount: 3 },
    });

    expect(audit.scopeEvidence).toEqual(scopeEvidence);
    expect(audit.incomingFingerprint).not.toBe(
      changedScope.incomingFingerprint,
    );
  });

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
      canonicalizationCandidateCount: 0,
      mergeCandidateCount: 0,
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

  it("approves an explicit Aigens many-to-one UUID merge", () => {
    const survivor = existing({
      externalProductId: "42",
    });
    const merged = existing({
      id: "33333333-3333-4333-a333-333333333333",
      externalProductId: "42#offering-period=dinner",
    });
    const next = incoming({ externalProductId: "42" });
    const audit = buildTransitionAudit(
      [survivor, merged],
      {
        snapshotCompleteness: "complete",
        items: [next],
        scopeEvidence: AIGENS_SCOPE_EVIDENCE,
      },
      "aigens",
    );

    expect(
      verifyMenuIdentityTransitionApproval(
        {
          provider: "aigens",
          externalOwnerId: null,
          externalStoreId: "102830",
          configurationFingerprint: "a".repeat(64),
        },
        [survivor, merged],
        {
          snapshotCompleteness: "complete",
          items: [next],
          scopeEvidence: AIGENS_SCOPE_EVIDENCE,
        },
        {
          schemaVersion: 4,
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
              rationale: "The response is the complete provider snapshot.",
            },
            replacements: [],
            canonicalizations: [],
            merges: [
              {
                survivorItemId: survivor.id,
                mergedItemIds: [merged.id],
                previousProductIds: [
                  survivor.externalProductId,
                  merged.externalProductId,
                ],
                nextProductId: next.externalProductId,
                duplicateVotePolicy: "deduplicate-identical",
                rationale:
                  "Both period aliases are occurrences of backend product 42.",
              },
            ],
            additions: [],
            removals: [],
            ambiguities: [],
          },
        },
      ),
    ).toEqual({
      replacements: [],
      canonicalizations: [],
      merges: [
        {
          survivorItemId: survivor.id,
          mergedItemIds: [merged.id],
          previousProductIds: [
            survivor.externalProductId,
            merged.externalProductId,
          ],
          nextProductId: next.externalProductId,
          duplicateVotePolicy: "deduplicate-identical",
        },
      ],
    });
  });

  it("canonicalizes a reviewed Aigens alias even when the dish is absent", () => {
    const previous = existing({
      externalProductId: "42#offering-period=lunch",
    });
    const audit = buildTransitionAudit(
      [previous],
      {
        snapshotCompleteness: "complete",
        items: [],
        scopeEvidence: AIGENS_SCOPE_EVIDENCE,
      },
      "aigens",
    );
    expect(audit.canonicalizationCandidates).toEqual([
      {
        itemId: previous.id,
        previous: expect.objectContaining({
          externalProductId: previous.externalProductId,
        }),
        nextProductId: "42",
        presentInSnapshot: false,
      },
    ]);

    expect(
      verifyMenuIdentityTransitionApproval(
        {
          provider: "aigens",
          externalOwnerId: null,
          externalStoreId: "102830",
          configurationFingerprint: "a".repeat(64),
        },
        [previous],
        {
          snapshotCompleteness: "complete",
          items: [],
          scopeEvidence: AIGENS_SCOPE_EVIDENCE,
        },
        {
          schemaVersion: 4,
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
              rationale: "The response is the complete provider snapshot.",
            },
            replacements: [],
            canonicalizations: [
              {
                itemId: previous.id,
                previousProductId: previous.externalProductId,
                nextProductId: "42",
                rationale:
                  "The period suffix is a historical alias of backend product 42.",
              },
            ],
            merges: [],
            additions: [],
            removals: [],
            ambiguities: [],
          },
        },
      ),
    ).toEqual({
      replacements: [],
      canonicalizations: [
        {
          itemId: previous.id,
          previousProductId: previous.externalProductId,
          nextProductId: "42",
        },
      ],
      merges: [],
    });
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

  it("fingerprints price options independently of object property order", () => {
    const labelFirst = {
      label: null,
      amountMinor: 1_500,
      currency: "HKD",
      sortOrder: 0,
    };
    const amountFirst = {
      amountMinor: 1_500,
      currency: "HKD",
      label: null,
      sortOrder: 0,
    };
    const first = buildMenuIdentityTransitionAudit(
      [existing({ priceOptions: [labelFirst] })],
      [incoming({ priceOptions: [labelFirst] })],
    );
    const reordered = buildMenuIdentityTransitionAudit(
      [existing({ priceOptions: [amountFirst] })],
      [incoming({ priceOptions: [amountFirst] })],
    );

    expect(reordered.existingFingerprint).toBe(first.existingFingerprint);
    expect(reordered.incomingFingerprint).toBe(first.incomingFingerprint);
  });

  it("fingerprints scope evidence independently of object property order", () => {
    const providerFirst: MenuSnapshotScopeEvidence = {
      provider: "aigens",
      externalStoreId: "102830",
      storeName: "Sanitized Aigens store",
      menuName: "Sanitized full catalog",
      providerPeriodCodes: ["B", "D", "L", "T"],
      categoryPeriodCodes: ["B", "D", "L", "T"],
      categoryCount: 2,
      groupCount: 3,
    };
    const countsFirst: MenuSnapshotScopeEvidence = {
      categoryCount: 2,
      groupCount: 3,
      categoryPeriodCodes: ["B", "D", "L", "T"],
      providerPeriodCodes: ["B", "D", "L", "T"],
      menuName: "Sanitized full catalog",
      storeName: "Sanitized Aigens store",
      externalStoreId: "102830",
      provider: "aigens",
    };
    const first = buildTransitionAudit([existing()], {
      snapshotCompleteness: "complete",
      scopeEvidence: providerFirst,
      items: [incoming()],
    });
    const reordered = buildTransitionAudit([existing()], {
      snapshotCompleteness: "complete",
      scopeEvidence: countsFirst,
      items: [incoming()],
    });

    expect(reordered.incomingFingerprint).toBe(first.incomingFingerprint);
  });

  it("fingerprints PinMe service windows independently of provider order", () => {
    const first = buildTransitionAudit([existing()], {
      snapshotCompleteness: "partial",
      scopeEvidence: {
        provider: "pinme",
        serviceWindows: [
          { startTime: "11:30", endTime: "14:30" },
          { startTime: "17:30", endTime: "21:00" },
        ],
      },
      items: [incoming()],
    });
    const reordered = buildTransitionAudit([existing()], {
      snapshotCompleteness: "partial",
      scopeEvidence: {
        provider: "pinme",
        serviceWindows: [
          { startTime: "17:30", endTime: "21:00" },
          { startTime: "11:30", endTime: "14:30" },
        ],
      },
      items: [incoming()],
    });

    expect(reordered.incomingFingerprint).toBe(first.incomingFingerprint);
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
          schemaVersion: 4,
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
            canonicalizations: [],
            merges: [],
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
          schemaVersion: 4,
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
            canonicalizations: [],
            merges: [],
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
          schemaVersion: 4,
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
            canonicalizations: [],
            merges: [],
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
          schemaVersion: 4,
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
            canonicalizations: [],
            merges: [],
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

  it("rejects obsolete v3 artifacts instead of claiming compatibility", () => {
    expect(() =>
      parseMenuIdentityTransitionArtifact({
        ...transitionFixture,
        schemaVersion: 3,
      }),
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

  it("rejects completeness that differs from the reviewed artifact", () => {
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
    ).toThrow("MENU_IDENTITY_TRANSITION_STALE");
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
          schemaVersion: 4,
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
            canonicalizations: [],
            merges: [],
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
      scopeEvidence: audit.scopeEvidence,
      ambiguities: audit.ambiguities,
      removals: audit.removals,
      additions: audit.additions,
      mergeCandidates: audit.mergeCandidates,
      canonicalizationCandidates: audit.canonicalizationCandidates,
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
          schemaVersion: 4,
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
            canonicalizations: [],
            merges: [],
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
