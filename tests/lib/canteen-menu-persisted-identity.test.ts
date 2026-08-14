import { describe, expect, it } from "vitest";
import { createPersistedMenuIdentityInterpreter } from "@/lib/canteen-menu-persisted-identity";

const SOURCE_ID = "11111111-1111-4111-a111-111111111111";
const CANTEEN_ID = "22222222-2222-4222-a222-222222222222";

describe("persisted canteen menu identity interpretation", () => {
  it("accepts the writer namespace for a padded stored Qmai owner", () => {
    const interpreter = createPersistedMenuIdentityInterpreter([
      {
        id: SOURCE_ID,
        canteenId: CANTEEN_ID,
        provider: "qmai",
        externalOwnerId: " owner-a ",
        externalStoreId: "store-a",
      },
    ]);

    expect(
      interpreter.interpret({
        canteenId: CANTEEN_ID,
        menuSourceId: SOURCE_ID,
        externalProductId: "product-42",
        externalSource: "qmai:owner-a:store-a",
        externalKey: "product-42",
      }),
    ).toMatchObject({
      authoritativeState: "managed",
      shadowState: "resolved",
      identitiesAgree: true,
      provider: "qmai",
    });
  });

  it("preserves the projected identity when the authoritative pair is absent", () => {
    const interpreter = createPersistedMenuIdentityInterpreter([
      {
        id: SOURCE_ID,
        canteenId: CANTEEN_ID,
        provider: "pinme",
        externalOwnerId: null,
        externalStoreId: "store-a",
      },
    ]);
    const persistedShadow = {
      canteenId: CANTEEN_ID,
      externalSource: "pinme:store-a",
      externalKey: "product-42:lunch",
    };

    const managed = interpreter.interpret({
      ...persistedShadow,
      menuSourceId: SOURCE_ID,
      externalProductId: "product-42",
    });
    const shadowOnly = interpreter.interpret({
      ...persistedShadow,
      menuSourceId: null,
      externalProductId: null,
    });

    expect(shadowOnly.projectedIdentity).toBe(managed.projectedIdentity);
    expect(shadowOnly).toMatchObject({
      authoritativeState: "manual",
      shadowState: "resolved",
      identitiesAgree: false,
    });
  });

  it("fails closed when canonicalization leaves multiple source candidates", () => {
    const interpreter = createPersistedMenuIdentityInterpreter([
      {
        id: SOURCE_ID,
        canteenId: CANTEEN_ID,
        provider: "qmai",
        externalOwnerId: "owner-a",
        externalStoreId: "store-a",
      },
      {
        id: "33333333-3333-4333-a333-333333333333",
        canteenId: CANTEEN_ID,
        provider: "qmai",
        externalOwnerId: " owner-a ",
        externalStoreId: "store-a",
      },
    ]);

    expect(
      interpreter.interpret({
        canteenId: CANTEEN_ID,
        menuSourceId: null,
        externalProductId: null,
        externalSource: "qmai:owner-a:store-a",
        externalKey: "product-42",
      }),
    ).toMatchObject({
      shadowState: "unsupported",
      shadowReason: "unsupported-source-namespace",
      projectedIdentity: null,
      identitiesAgree: false,
    });
  });
});
