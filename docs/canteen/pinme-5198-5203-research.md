# PINME 5198 / 5203 comparison

Observed on 2026-08-13 (Asia/Hong_Kong). This note uses only read-only public
PINME pages and APIs plus repository source. No cart, order, payment, or other
write endpoint was called. Counts are point-in-time observations: PINME may
filter menus by mode, schedule, availability, or later upstream edits.

## Conclusion

PINME stores 5198 and 5203 are not duplicate URLs or two modes of one menu.
They are two independently identified outlets at the same physical location:

- **5198 — 開心軒（學生飯堂）**: the main student canteen, serving meals and
  some conventional drinks.
- **5203 — 開心軒茶社**: a separate drinks outlet, serving milk tea, cheese
  foam drinks, fruit tea, pure tea, winter-melon tea, and related drinks.

They share the same published address, telephone number, and business code,
which supports treating them as sibling outlets operated at the same UC
location. Their store IDs, names, schedules, service modes, menu/category IDs,
and products remain distinct. The live takeout menus had **zero shared product
IDs and zero shared normalized product names**.

For CUpedia, model these as **two independent canteen pages**. Keep the
existing UC page bound to `pinme:5198`, and create a separate canteen record
for 開心軒茶社 bound to `pinme:5203`. Do not merge 5203 into a payload whose
source is `pinme:5198`. Using only 5198 is acceptable only as an explicit
product-scope decision to omit the tea shop; it is not a technically complete
representation of the dining outlets at this UC location.

## First-party comparison

Sources:

- [PINME 5198 takeout entry](https://meal.pin2eat.com/store/5198/takeout)
- [PINME 5203 takeout entry](https://meal.pin2eat.com/store/5203/takeout)
- PINME read-only store metadata:
  `https://meal.pin2eat.com/api/store/store-info?store_id=<id>`
- PINME read-only menu:
  `https://meal.pin2eat.com/api/home/product-menus?store_id=<id>&takeout=1&order_sub_type=1`

The two short entry URLs resolve to the same PINME frontend route shape but
retain their respective IDs:

```text
/store/5198/takeout -> /v2/package_store/pages/store/home?store_id=5198
/store/5203/takeout -> /v2/package_store/pages/store/home?store_id=5203
```

| Field                     | 5198                                                                                   | 5203                                                                           |
| ------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Official display name     | 開心軒（學生飯堂）                                                                     | 開心軒茶社                                                                     |
| Published address         | 沙田香港中文大學聯合書院張祝珊師生康樂中心地下聯合書院學生飯堂                         | Same                                                                           |
| Published telephone       | 28322179                                                                               | Same                                                                           |
| Published business code   | 61753585-000-07-22-1                                                                   | Same                                                                           |
| PINME store identity      | `5198`                                                                                 | `5203`                                                                         |
| Schedule                  | Mon–Fri 08:00–19:45; Sat 11:00–19:45                                                   | Daily 11:00–21:00                                                              |
| Store state when observed | `is_close=0`, `is_operating=1`                                                         | `is_close=0`, `is_operating=1`                                                 |
| Service flags             | dine-in and takeout; 10-minute takeout estimate                                        | takeout-facing outlet; 5-minute takeout estimate                               |
| Representative groups     | breakfast, two-dish rice, stir-fried noodles/rice, Chinese dishes, pasta, curry, bento | milk tea, cheese foam, soda, fruit tea, pure tea, winter-melon tea, hot drinks |
| Live takeout menu         | 19 groups, 78 unique products                                                          | 10 groups, 64 unique products                                                  |
| Live takeout price range  | HK$8–62                                                                                | HK$1–27 (includes a HK$1 bag item)                                             |
| Live non-takeout query    | 20 groups, 82 unique products                                                          | 10 groups, 64 unique products                                                  |

The four products visible only in the observed 5198 non-takeout query were
the four Korean stone-pot rice products. This confirms that entry mode can
affect the returned menu, but does not connect 5198 to 5203: 5203's menu was
unchanged between the two observed query modes.

## Identity and overlap analysis

For the observed takeout responses:

| Comparison                                        | Result |
| ------------------------------------------------- | -----: |
| Unique products in 5198                           |     78 |
| Unique products in 5203                           |     64 |
| Shared `product_id` values                        |      0 |
| Shared names after trimming/collapsing whitespace |      0 |
| Product-ID Jaccard similarity                     |  0.000 |
| Products only in 5198                             |     78 |
| Products only in 5203                             |     64 |

The same conclusion holds for the non-takeout query: 82 versus 64 unique
products, with zero shared IDs and zero shared normalized names. Because no ID
is shared, there are no same-ID name, price, or status differences to report.
All products returned in the compared snapshots had active status. Products
and groups also carry their respective store's own `store_id`.

Representative 5198-only items include `兩餸飯`, `雞扒台式肉燥飯`,
`日式流心漢堡拼甜薯咖喱飯`, and `黑椒牛柳絲炒意大利粉`.
Representative 5203-only items include `珍珠奶茶`, `芝士奶蓋茉莉`,
`白桃烏龍厚奶`, and `愛玉冬瓜茶`.

This is stronger evidence than a category-label difference: even the provider
identities of the menu entities are disjoint. Deduplicating by `product_id`
while changing 5203's source to `pinme:5198` destroys the upstream namespace
and prevents independent sync health, retirement, and ordering handoff.

## Repository evidence

The current adapter receives a persisted menu-source record and emits only the
provider's stable `externalProductId` values in
[`../../src/lib/canteen-pinme-menu.ts`](../../src/lib/canteen-pinme-menu.ts).
The provider fetcher sends that source record's `externalStoreId` in the URL
and `Store-id` header in
[`../../src/lib/canteen-menu-source-adapters.ts`](../../src/lib/canteen-menu-source-adapters.ts).
Reconciliation is scoped by `menuSourceId + externalProductId`; callers cannot
invent a free-form `pinme:<id>` namespace or pair a 5203 snapshot with the 5198
canteen. That boundary matches the official API evidence: 5198 and 5203 must
not be silently collapsed into one external source.

The existing ordering research and QR generator currently record only the
5198 UC entry:

- [`../cuhk-qr-ordering-research.md`](../cuhk-qr-ordering-research.md)
- [`../../scripts/regen-canteen-qr.py`](../../scripts/regen-canteen-qr.py)

That is evidence about the currently selected UC handoff, not evidence that
5203 is a duplicate or irrelevant source. The tea shop needs its own page and
handoff so users do not mistake the student-canteen link for a way to order its
drinks.

The present schema has a unique index on `canteen_menu_sources.canteen_id` in
[`../../src/db/schema.ts`](../../src/db/schema.ts), so it permits one menu
source per canteen. That matches this decision: the 5198 student canteen and
the 5203 tea shop each receive their own canteen record, source, menu history,
votes, comments, and ordering handoff. No multi-source schema change is needed.

## Recommended model

1. Keep two persisted PINME source records whose `externalStoreId` values are
   exactly `5198` and `5203`.
2. Keep the current UC/開心軒（學生飯堂） page as the canteen backed by 5198.
3. Create an independent 開心軒茶社 canteen page backed by 5203. The two pages
   may display the same location because co-location does not imply one menu or
   one ordering destination.
4. Preserve both exact ordering URLs. A single 5198 handoff cannot order 5203
   products; conversely, 5203 is a drinks-only destination.
5. Keep the stable bare PINME `product_id` as each item's key within its own
   persisted `menuSourceId`. The stable identity is
   `menuSourceId + externalProductId`; the older `externalSource` string is
   retained only as a rollout shadow and is not an authority.
6. Do not combine snapshots and do not perform cross-store name deduplication.
   Even if similar drink names appear later, independently managed outlets may
   have different variants, prices, availability, and ordering destinations.

## Safe reproduction

The following commands call only public read endpoints. They do not obtain or
print anonymous bearer tokens. Do not save the full store configuration in the
repository: it contains fields unnecessary for menu synchronization.

```bash
# Minimal public metadata. Repeat with store_id=5203.
curl -fsS \
  'https://meal.pin2eat.com/api/store/store-info?store_id=5198' \
  | jq '.data | {store_id,name,address,telephone,is_close,is_operating,takeout,dinein,takeout_time,business_schedule}'

# Point-in-time takeout menu summary. Repeat with store_id=5203.
curl -fsS \
  'https://meal.pin2eat.com/api/home/product-menus?store_id=5198&takeout=1&order_sub_type=1' \
  | jq '{code, groups:(.data.group|length), products:([.data.group[]?.products[]?.product_id]|unique|length), group_names:[.data.group[]?.local_name]}'

# Verify the official takeout route without interacting with an order.
curl -fsSL -o /dev/null -w '%{http_code} %{url_effective}\n' \
  'https://meal.pin2eat.com/store/5198/takeout'
```

For a local overlap comparison without retaining API data in the repository,
write the two responses to an OS temporary directory, extract sorted unique
IDs, and use `comm`:

```bash
tmp_dir=$(mktemp -d)
curl -fsS \
  'https://meal.pin2eat.com/api/home/product-menus?store_id=5198&takeout=1&order_sub_type=1' \
  | jq -r '[.data.group[]?.products[]?.product_id]|unique[]' \
  | sort > "$tmp_dir/5198.ids"
curl -fsS \
  'https://meal.pin2eat.com/api/home/product-menus?store_id=5203&takeout=1&order_sub_type=1' \
  | jq -r '[.data.group[]?.products[]?.product_id]|unique[]' \
  | sort > "$tmp_dir/5203.ids"
comm -12 "$tmp_dir/5198.ids" "$tmp_dir/5203.ids"
```

An empty final output means no product ID was shared in that observation.
