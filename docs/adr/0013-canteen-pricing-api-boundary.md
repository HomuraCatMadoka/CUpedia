# ADR 0013: Canteen pricing uses options behind a stable API boundary

## Status

Accepted

## Context

A menu item can have no price, one price, or labelled prices such as hot/iced and
small/large. The original `canteen_menu_items.price` integer represented one
whole-HKD value and leaked directly into UI components. Changing that column
would therefore also change the public response and frontend code.

The S.H. Ho menu also distinguishes an independently sold drink price from a
set-meal surcharge. Those values are different commercial contexts and must not
be merged merely because their labels look alike.

## Decision

1. Store current independent-sale prices in `canteen_menu_item_prices`, one row
   per labelled option. Amounts use minor currency units.
2. Public and admin menu DTOs expose only `pricing.options[]`; UI code iterates
   options and does not interpret labels such as `凍` or `熱`.
3. Keep `canteen_menu_items.price` temporarily as a legacy read column. The
   mapping layer converts it to one HKD option when no normalized rows exist.
4. New writes use the normalized table. Legacy JSON/OCR integer prices are
   accepted at the input boundary and converted to minor units.
5. Set-meal surcharges remain separate source products until the ordering model
   represents contextual modifiers explicitly.

## Consequences

- Database migrations can change storage without changing the menu API.
- Price option IDs are suitable for UI selection; labels remain presentation.
- Existing rows remain readable during rollout without a destructive migration.
- Removing the legacy column requires a later migration after old writers and
  unmigrated rows have been audited.
