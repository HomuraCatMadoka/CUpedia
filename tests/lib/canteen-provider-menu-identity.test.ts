import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  assertProviderMenuIdentitySnapshot,
  canonicalizeProviderMenuState,
  matchesPersistedProviderMenuSourceNamespace,
  normalizePersistedMenuShadowKey,
  normalizePublishedProviderIdentity,
  parsePersistedProviderMenuSourceNamespace,
  providerMenuIdentityContracts,
  ProviderMenuIdentityError,
  type MenuProvider,
} from "@/lib/canteen-provider-menu-identity";
import {
  planMenuSync,
  type ExistingSyncMenuItem,
} from "@/lib/canteen-menu-sync";
import { parseMenuSyncJson } from "@/lib/canteen-types";

type Fixture = {
  providers: Array<{
    provider: MenuProvider;
    source: { externalStoreId: string; externalOwnerId?: string };
    current: string;
    historical: string[];
    canonical: string;
    periodChangeCreatesOffering: boolean;
  }>;
};

const fixture = JSON.parse(
  readFileSync(
    new URL("./fixtures/canteen-provider-menu-identity.json", import.meta.url),
    "utf8",
  ),
) as Fixture;

const SOURCE_ID = "11111111-1111-4111-a111-111111111111";

function persistedItem(externalProductId: string): ExistingSyncMenuItem {
  return {
    id: "uuid-with-votes-and-comments",
    name: "舊名",
    mealPeriods: ["lunch"],
    sortOrder: 0,
    svgKey: "舊分類",
    priceOptions: [
      { label: null, amountMinor: 1000, currency: "HKD", sortOrder: 0 },
    ],
    menuSourceId: SOURCE_ID,
    externalProductId,
    isAvailable: true,
  };
}

describe("provider menu identity contract (#636)", () => {
  it("declares source locator, offering identity, and mutable attributes", () => {
    expect(providerMenuIdentityContracts).toMatchObject({
      pinme: {
        sourceLocatorFields: ["externalStoreId"],
        offeringIdentityFields: ["product_id"],
      },
      ichef: {
        sourceLocatorFields: ["externalStoreId"],
        offeringIdentityFields: ["uuid"],
      },
      qmai: {
        sourceLocatorFields: ["externalOwnerId", "externalStoreId"],
        offeringIdentityFields: ["goodsId"],
      },
      aigens: {
        sourceLocatorFields: ["externalStoreId"],
        offeringIdentityFields: ["backendId", "mealPeriod"],
      },
    });

    for (const contract of Object.values(providerMenuIdentityContracts)) {
      expect(contract.mutableAttributeFields).toEqual(
        expect.arrayContaining([
          "name",
          "priceOptions",
          "isAvailable",
          "category",
          "mealPeriods",
        ]),
      );
      expect(contract.offeringIdentityFields).not.toContain("name");
    }
  });

  it.each(fixture.providers)(
    "$provider normalizes current and historically published identities",
    ({ provider, current, historical, canonical }) => {
      expect(normalizePublishedProviderIdentity(provider, current)).toBe(
        canonical,
      );
      expect(
        historical.map((identity) =>
          normalizePublishedProviderIdentity(provider, identity),
        ),
      ).toEqual(historical.map(() => canonical));
    },
  );

  it("decodes only the exact Aigens writer shadow envelope", () => {
    expect(
      normalizePersistedMenuShadowKey(
        "aigens",
        "product-42#offering-period=lunch#period=lunch",
      ),
    ).toBe("product-42#offering-period=lunch");

    for (const malformed of [
      "product-42#offering-period=lunch#period=bogus",
      "product-42#offering-period=lunch#period=",
      "product-42#offering-period=lunch#period=dinner",
    ]) {
      expect(() =>
        normalizePersistedMenuShadowKey("aigens", malformed),
      ).toThrow("MALFORMED_IDENTITY");
    }
  });

  it.each(["pinme", "ichef", "qmai"] as const)(
    "$provider rejects malformed writer period suffixes",
    (provider) => {
      expect(() =>
        normalizePersistedMenuShadowKey(provider, "product-42#period=bogus"),
      ).toThrow("MALFORMED_IDENTITY");
    },
  );

  it("parses only supported persisted source namespace shapes", () => {
    expect(parsePersistedProviderMenuSourceNamespace("pinme:store-a")).toEqual({
      provider: "pinme",
      externalOwnerId: null,
      externalStoreId: "store-a",
    });
    expect(
      parsePersistedProviderMenuSourceNamespace("order-place:store-a"),
    ).toEqual({
      provider: "aigens",
      externalOwnerId: null,
      externalStoreId: "store-a",
    });
    expect(
      parsePersistedProviderMenuSourceNamespace("qmai:owner-a:store-a"),
    ).toEqual({
      provider: "qmai",
      externalOwnerId: "owner-a",
      externalStoreId: "store-a",
    });

    for (const malformed of [
      "pinme:store:extra",
      "order-place:store:extra",
      "qmai:owner:extra:store",
      "qmai:owner:store:extra",
    ]) {
      expect(parsePersistedProviderMenuSourceNamespace(malformed)).toBeNull();
    }
  });

  it.each([
    {
      provider: "pinme" as const,
      source: { externalStoreId: "store:extra" },
      externalSource: "pinme:store:extra",
    },
    {
      provider: "aigens" as const,
      source: { externalStoreId: "store:extra" },
      externalSource: "order-place:store:extra",
    },
    {
      provider: "qmai" as const,
      source: {
        externalOwnerId: "owner:extra",
        externalStoreId: "store-a",
      },
      externalSource: "qmai:owner:extra:store-a",
    },
    {
      provider: "qmai" as const,
      source: {
        externalOwnerId: "owner-a",
        externalStoreId: "store:extra",
      },
      externalSource: "qmai:owner-a:store:extra",
    },
  ])(
    "rejects matching invalid $provider source and shadow locators",
    ({ provider, source, externalSource }) => {
      expect(
        matchesPersistedProviderMenuSourceNamespace(
          provider,
          source,
          externalSource,
        ),
      ).toBe(false);
    },
  );

  it("matches supported current and historical namespaces after canonicalization", () => {
    expect(
      matchesPersistedProviderMenuSourceNamespace(
        "aigens",
        { externalStoreId: "store-a" },
        "order-place:store-a",
      ),
    ).toBe(true);
    expect(
      matchesPersistedProviderMenuSourceNamespace(
        "qmai",
        { externalOwnerId: " owner-a ", externalStoreId: "store-a" },
        "qmai:owner-a:store-a",
      ),
    ).toBe(true);
  });

  it.each(fixture.providers)(
    "$provider preserves a historical database UUID when current identity arrives",
    ({ provider, historical, canonical }) => {
      const state = canonicalizeProviderMenuState(
        provider,
        parseMenuSyncJson({
          snapshotCompleteness: "complete",
          items: [{ externalProductId: canonical, name: "目前菜品" }],
        }),
        [persistedItem(historical[0])],
      );
      const plan = planMenuSync(SOURCE_ID, state.input, state.existingItems);
      expect(plan.actions).toEqual([
        expect.objectContaining({
          itemId: "uuid-with-votes-and-comments",
          externalProductId: canonical,
        }),
      ]);
      expect(plan.actions.some((action) => action.action === "create")).toBe(
        false,
      );
      expect(
        plan.actions.some((action) => action.action === "deactivate"),
      ).toBe(false);
    },
  );

  it.each(fixture.providers)(
    "$provider mutable changes update the UUID that owns votes and comments",
    ({ provider, current }) => {
      const externalProductId = normalizePublishedProviderIdentity(
        provider,
        current,
      );
      const input = parseMenuSyncJson({
        snapshotCompleteness: "complete",
        items: [
          {
            externalProductId,
            name: "新名",
            mealPeriods: provider === "aigens" ? ["lunch"] : ["dinner"],
            pricing: {
              options: [{ amountMinor: 9900, currency: "HKD", sortOrder: 0 }],
            },
            svgKey: "新分類",
          },
        ],
      });
      const plan = planMenuSync(SOURCE_ID, input, [
        persistedItem(externalProductId),
      ]);
      expect(plan.conflicts).toEqual([]);
      expect(plan.actions).toEqual([
        expect.objectContaining({
          action: "update",
          itemId: "uuid-with-votes-and-comments",
          externalProductId,
        }),
      ]);
    },
  );

  it("keeps simultaneous Aigens period offerings on separate UUIDs", () => {
    const plan = planMenuSync(
      SOURCE_ID,
      parseMenuSyncJson({
        snapshotCompleteness: "complete",
        items: [
          {
            externalProductId: "42#offering-period=lunch",
            name: "午餐 offering",
            mealPeriods: ["lunch"],
          },
          {
            externalProductId: "42#offering-period=dinner",
            name: "晚餐 offering",
            mealPeriods: ["dinner"],
          },
        ],
      }),
      [persistedItem("42#offering-period=lunch")],
    );
    expect(plan.conflicts).toEqual([]);
    expect(plan.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "update",
          itemId: "uuid-with-votes-and-comments",
          externalProductId: "42#offering-period=lunch",
        }),
        expect.objectContaining({
          action: "create",
          itemId: null,
          externalProductId: "42#offering-period=dinner",
        }),
      ]),
    );
  });

  it.each(fixture.providers)(
    "$provider creates a new UUID only for a genuinely new upstream product",
    ({ provider, current, canonical }) => {
      const nextIdentity =
        provider === "aigens" ? "99#offering-period=lunch" : `${canonical}-new`;
      const state = canonicalizeProviderMenuState(
        provider,
        parseMenuSyncJson({
          snapshotCompleteness: "complete",
          items: [{ externalProductId: nextIdentity, name: "真正新菜品" }],
        }),
        [persistedItem(current)],
      );
      const plan = planMenuSync(SOURCE_ID, state.input, state.existingItems);
      expect(plan.actions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: "create",
            itemId: null,
            externalProductId: nextIdentity,
          }),
          expect.objectContaining({
            action: "deactivate",
            itemId: "uuid-with-votes-and-comments",
          }),
        ]),
      );
    },
  );

  it.each(fixture.providers)(
    "$provider reactivates the UUID that retains votes and comments",
    ({ provider, current }) => {
      const state = canonicalizeProviderMenuState(
        provider,
        parseMenuSyncJson({
          snapshotCompleteness: "complete",
          items: [{ externalProductId: current, name: "重新供應" }],
        }),
        [{ ...persistedItem(current), isAvailable: false }],
      );
      const plan = planMenuSync(SOURCE_ID, state.input, state.existingItems);
      expect(plan.actions).toEqual([
        expect.objectContaining({
          action: "reactivate",
          itemId: "uuid-with-votes-and-comments",
        }),
      ]);
    },
  );

  it.each(fixture.providers)(
    "$provider preserves identity across mutable menu changes",
    ({ provider, source, canonical }) => {
      const first = assertProviderMenuIdentitySnapshot(provider, source, [
        { externalProductId: canonical, name: "舊名", mealPeriods: ["lunch"] },
      ]);
      const changed = assertProviderMenuIdentitySnapshot(provider, source, [
        {
          externalProductId: canonical,
          name: "新名",
          mealPeriods: ["dinner"],
          priceOptions: [{ amountMinor: 9900 }],
          isAvailable: false,
          category: "新分類",
        },
      ]);
      expect(changed[0]).toBe(first[0]);
    },
  );

  it.each(fixture.providers)(
    "$provider makes only provider-defined offering changes into new identities",
    ({ provider, source, canonical, periodChangeCreatesOffering }) => {
      const nextIdentity =
        provider === "aigens" ? "42#offering-period=dinner" : canonical;
      const [before] = assertProviderMenuIdentitySnapshot(provider, source, [
        { externalProductId: canonical, name: "同一菜品" },
      ]);
      const [after] = assertProviderMenuIdentitySnapshot(provider, source, [
        { externalProductId: nextIdentity, name: "同一菜品" },
      ]);
      expect(after === before).toBe(!periodChangeCreatesOffering);
    },
  );

  it("never uses a product name as an identity fallback", () => {
    expect(() =>
      assertProviderMenuIdentitySnapshot("pinme", { externalStoreId: "5198" }, [
        { externalProductId: "", name: "不能當作 ID 的菜名" },
      ]),
    ).toThrowError(expect.objectContaining({ code: "EMPTY_IDENTITY" }));
  });

  it.each([
    ["EMPTY_SNAPSHOT", []],
    ["EMPTY_IDENTITY", [{ externalProductId: "", name: "A" }]],
    [
      "MALFORMED_IDENTITY",
      [{ externalProductId: "bad#period=nope", name: "A" }],
    ],
    [
      "DUPLICATE_IDENTITY",
      [
        { externalProductId: "same", name: "A" },
        { externalProductId: "same", name: "A" },
      ],
    ],
    [
      "COLLIDING_IDENTITY",
      [
        { externalProductId: "same", name: "A" },
        { externalProductId: "same#period=lunch", name: "B" },
      ],
    ],
  ] as const)("fails closed with %s", (code, items) => {
    expect(() =>
      assertProviderMenuIdentitySnapshot(
        "pinme",
        { externalStoreId: "5198" },
        items,
      ),
    ).toThrowError(expect.objectContaining({ code }));
  });

  it("bounds and redacts diagnostics", () => {
    let caught: unknown;
    try {
      assertProviderMenuIdentitySnapshot(
        "qmai",
        { externalOwnerId: "secret-owner", externalStoreId: "secret-store" },
        Array.from({ length: 20 }, (_, index) => ({
          externalProductId: `secret-product-${index}#period=nope`,
          name: `secret-name-${index}`,
        })),
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ProviderMenuIdentityError);
    const error = caught as ProviderMenuIdentityError;
    expect(error.diagnostic.samples.length).toBeLessThanOrEqual(5);
    expect(error.diagnostic).toMatchObject({ provider: "qmai", count: 20 });
    expect(JSON.stringify(error.diagnostic)).not.toContain("secret");
    expect(error.message.length).toBeLessThanOrEqual(300);
  });
});
