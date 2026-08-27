# ADR 0031: Separate canonical dishes from provider offerings

## Status

Accepted

## Context

Ordering providers can publish the same user-recognizable dish under several
product IDs. The IDs may differ by meal period, menu publication, category or
price. Treating every provider ID as a CUpedia dish creates duplicate menu rows
and splits votes and comments. Treating price as identity also creates a new
dish whenever the provider changes its price.

Provider IDs are still valuable: they say which upstream offering was observed
and let synchronization track its current occurrence facts. They are not the
same thing as the stable UUID users vote on.

## Decision

1. `canteen_menu_items` is the canonical dish. Its UUID is the identity exposed
   to users and referenced by votes and comments.
2. `canteen_menu_provider_offerings` maps each menu-source/provider product ID
   to exactly one canonical dish UUID. Several offerings may map to one dish.
3. Within one canteen source, offerings automatically join when their names
   have the same narrow normalized key: full-width forms are converted to their
   half-width equivalents, outer space is trimmed, repeated whitespace is
   collapsed, and ASCII English letters are case-folded. Other Unicode
   compatibility characters and non-English case are unchanged. No punctuation,
   parenthetical text, specifications, discounts or hot/cold wording is
   removed.
4. Meal period, price options, category and provider ordering are occurrence
   facts in `canteen_menu_offering_occurrences`. They never create a canonical
   UUID. Labelled prices keep their labels; distinct unlabelled current amounts
   remain distinct options.
5. The canonical display name, primary category and order come from the
   earliest current provider occurrence. Other current categories and prices
   remain evidence. A price change updates facts without replacing the UUID.
6. If existing provider offerings with one normalized name already point to
   several canonical UUIDs, ordinary synchronization fails closed. The audited
   convergence and user-history move are handled by the separate canonical
   migration workflow.
7. The existing `menu_source_id` and `external_product_id` columns on
   `canteen_menu_items` remain compatibility fields during rollout. New code
   treats the offering table as the provider-ID authority.

This decision supersedes the parts of ADR 0014 and ADR 0027 that equated one
provider product ID with one CUpedia dish UUID. Their provider-ID selection,
snapshot scope, activity, audit and history-preservation rules remain in force.

## Consequences

- Same-name PINME, Aigens, iCHEF and Qmai offerings render as one dish even when
  their IDs, meal periods, categories or prices differ.
- Price increases and current price alternatives do not fragment votes or
  comments.
- Deliberately different names such as hot/cold variants, specifications or
  discount-qualified items remain separate.
- Existing duplicate UUIDs are not silently merged during an ordinary sync;
  they require the deterministic migration and audit described by the follow-up
  work.
