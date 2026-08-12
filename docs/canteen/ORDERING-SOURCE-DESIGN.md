# Canteen menu sources and ordering handoffs

This design turns the provider research in
[`../cuhk-qr-ordering-research.md`](../cuhk-qr-ordering-research.md) and
[`../ichef-guest-ordering.md`](../ichef-guest-ordering.md) into an implementation
sequence for the canteen subsystem.

## Provider inventory

| Provider | Confirmed stores                                             | Menu read                                                                                             | Ordering handoff                                                           |
| -------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Aigens   | 112891 CU CAFÉ; 102830 S.H. Ho; 102216 University Station MX | One public store-menu GET per store; nested categories, groups, items, periods, CRM flags             | Preserve the original scan/brand URL and mode (`prekiosk`, `pickup`, etc.) |
| iCHEF    | UQftKWxU #FOTD                                               | Public GraphQL menu-hours query followed by categories query                                          | Preserve the validated table URL; checkout requires session + diner + cart |
| PINME    | 4898, 4899, 5198, 5500, 5505, 5581                           | Anonymous token plus read-side store/menu calls                                                       | Preserve the exact takeout/store URL; never substitute shared `/table/1`   |
| Qmai     | 221033 + multi 331725 (WeBite Space)                         | Official H5 exposes live categories, goods, availability and cart calculation; adapter still required | Preserve both `store_id` and `multi_id` in the official URL                |

The downloaded Aigens build `2026-05-26.4.2.0.20260527` was analyzed from a
temporary directory. The third-party minified bundles are intentionally not
vendored. Reproducible findings are retained in the research document: 71
unique Aigens `/api/` paths/templates, the order-session/calculate/checkout/pay
sequence, and the exact public menu request used by the existing adapter.

## Target module shape

The external seam should remain small:

```ts
type MenuSourceConfig = {
  provider: "aigens" | "ichef" | "pinme" | "qmai";
  externalStoreId: string;
  config: Record<string, unknown>;
};

type MenuSourceAdapter = {
  fetchSnapshot(source: MenuSourceConfig): Promise<MenuSyncInput>;
};
```

`fetchSnapshot` hides request count, token bootstrap, pagination/query chains,
response validation, money conversion, meal-period mapping, retry policy, and
provider error translation. Callers should not receive raw provider DTOs.

The ordering interface is deliberately smaller:

```ts
type OrderingHandoff = {
  provider: "aigens" | "ichef" | "pinme" | "qmai" | "external";
  url: string;
};
```

The public page only opens this URL. A provider cart/order client is not part of
the canteen menu module.

## Persistence changes

### `canteen_menu_sources`

Keep the current sync-health columns. Add:

- provider values `pinme` and `qmai`;
- `config jsonb not null default '{}'`, limited to public, validated read
  parameters such as Aigens locale/menu/group, iCHEF platform, PINME entry
  mode, or Qmai `multiId`;
- optionally `last_observed_at` only if it differs operationally from
  `lastSuccessAt`.

Do not add provider-specific columns or raw snapshot JSON. `externalStoreId`
remains the primary provider identity; composite identities such as Qmai use a
validated config field.

### `canteen_ordering_handoffs`

Add a separate one-to-one table initially:

```text
id, canteen_id UNIQUE, provider, url, enabled, created_at, updated_at
```

Validate `https`, length, supported provider, and prohibit known ephemeral
parameters such as iCHEF `sessionUuid` or order/payment identifiers. Keep the
full stable URL so provider-specific mode/table/location parameters survive.

Do not add modifier, cart, order, payment, member, or coupon tables in this
phase.

## Adapter work

1. Extract a provider-neutral `fetchSnapshot(source, { fetchImpl })` registry.
   Move shared timeout/retry/HTTP validation into the deep module.
2. Add runtime schemas for Aigens and iCHEF before conversion. The current code
   uses TypeScript assertions after JSON parsing; malformed upstream JSON can
   currently travel too far into the adapter.
3. Add the PINME adapter with anonymous token bootstrap and store/menu reads.
   Strip token and identity fields before hashing or logging.
4. Add Qmai only after its exact live menu DTO has fixtures and a stable
   read-side request sequence. Its `storeId + multiId` must be tested.
5. Make the Aigens external key independent of array order. The current
   `${backendId}:${periods[0]}` identity can change when the provider reorders a
   product's periods. Either keep an intentional per-period row with one key
   per emitted period or use the product backend ID for one multi-period row.
6. Hash the canonical normalized snapshot, not tokens, timestamps, upstream
   array noise, or other volatile fields.

## Sync policy

- Keep the last successful normalized menu when a provider is closed,
  unreachable, invalid, or unexpectedly empty.
- Record structured error codes and observed store state separately from a
  genuine complete snapshot.
- Apply suspicious-drop protection before deactivating rows.
- Limit concurrency per provider and use bounded retries with jitter. A second
  attempt is appropriate for reads; never automatically retry an order
  mutation.
- Menu prices are public observations. Personalized member/card/coupon prices
  remain official-site-only unless a later promotion model is approved.

## Public and admin UI

1. Replace QR-file discovery as the interaction source with the ordering
   handoff URL.
2. Desktop: show both an `Open official ordering` link and a QR generated from
   the same URL. Mobile: make the link the primary action; showing a QR on the
   same phone is secondary.
3. Display source freshness (`lastSuccessAt`) and a stale warning when needed;
   never imply current stock or final price.
4. Admin should edit/test menu source and ordering handoff separately. A
   read-only test shows store identity, item count, observed status and a small
   sample before saving.
5. The handoff warning states that modifiers, eligibility, inventory, final
   amount, order and payment are controlled by the provider.

## Delivery sequence

### Phase 1 — finish safe read-side sync

- Add source config and provider enum support.
- Add runtime provider schemas and fixtures.
- Configure Aigens/iCHEF sources already verified.
- Add PINME read adapter.
- Keep Qmai behind a disabled/experimental source until fixture coverage is
  complete.

### Phase 2 — make handoff a first-class feature

- Add the ordering-handoff table and admin editor.
- Render official link + generated QR from the URL.
- Migrate the current QR mappings, preserving exact modes and table/location
  parameters.

### Phase 3 — operational hardening

- Add source health visibility, stale-menu messaging and per-provider metrics.
- Observe menus across open/closed transitions before enabling automatic
  deactivation for each provider.

### Explicit non-goal

Do not implement server-side ordering or payment in these phases. The analyzed
providers all require stateful sessions and server-created orders before a
payment handoff exists. That capability has a different operational and
security interface from menu synchronization.
