# ADR 0021: Separate menu sync from ordering handoff

## Status

Proposed

## Context

CUHK canteen QR codes currently lead to at least four ordering providers:
Aigens, iCHEF, PINME, and Qmai. Their public menu reads are materially
different, but all can be normalized for the existing canteen menu UI.

Ordering is a different problem. It requires provider-owned browser state,
modifiers, an authoritative quote, eligibility checks, an order mutation, and
only then a payment handoff. A provider's menu identity also does not always
determine its official ordering URL: Aigens uses mode-bearing scan links,
PINME links can contain takeout or table context, iCHEF needs a validated table
name, and Qmai identifies the location with both `store_id` and `multi_id`.

Treating menu synchronization and ordering as one provider interface would
make every menu caller learn ordering state and would encourage storing
ephemeral credentials in the canteen database.

## Decision

1. Keep menu synchronization behind one deep module whose interface accepts a
   menu-source configuration and returns a normalized `MenuSyncInput`.
2. Validate each upstream response with an in-memory provider schema. Do not
   persist the raw provider response by default.
3. Store only non-sensitive source configuration and sync health in
   `canteen_menu_sources`. Provider-specific public parameters live in a
   validated JSON configuration object rather than new columns per provider.
4. Model the official ordering entry as a separate, stable **ordering
   handoff**. Store the complete human-verified URL; do not reconstruct it from
   the menu source or QR asset name.
5. The public canteen page may deep-link to the ordering handoff and display a
   QR generated from that same URL. The URL is the source of truth; the image
   is a presentation asset.
6. CUpedia does not persist provider session tokens, carts, member/card
   identity, coupon redemptions, orders, charges, or payment URLs.
7. A future proxy-ordering module requires a separate ADR, provider approval or
   sandbox, idempotency, quote expiry, and operational ownership for duplicate
   orders, cancellation, refunds, and payment failures.

## Consequences

- Cron, admin, and public pages depend on small provider-neutral interfaces.
- Adding PINME or Qmai changes an adapter and validated configuration, not the
  canteen UI or sync orchestration.
- Menu display remains available when official checkout is closed.
- Provider modifiers and personalized discounts can stay transient until the
  product explicitly needs to reproduce a provider cart.
- An ordering handoff can change without resetting menu item identities,
  votes, or comments.
