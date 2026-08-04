# #501 Foodle Match visual acceptance

This review uses the checked-in, reviewed prototype
[`docs/prototypes/foodle-dating-card.html`](../prototypes/foodle-dating-card.html)
as the interaction and visual source of truth. The implementation captures use
the same four-restaurant, 30-minute fixture. Desktop captures are 1280 × 720;
mobile captures are 390 × 844.

## State matrix

| State               | Reviewed mockup evidence                                                                                                                                                                                                                                            | Implementation — desktop                                                    | Implementation — 390px                                                                                                                               | Result                                                                                                                                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Empty               | Saved-surface shell: [desktop](screenshots/501-mockup-saved-desktop.png), [390px](screenshots/501-mockup-saved-mobile-390.png). The exact empty branch is the checked-in prototype at lines 6774–6815 (`renderSavedBody`, `saved-empty`, no footer action).         | [Empty desktop](screenshots/501-implementation-empty-desktop.png)           | [Empty 390px](screenshots/501-implementation-empty-mobile-390.png)                                                                                   | Aligned: the user remains on the saved surface, sees a direct empty message, keeps the compact last-result entry, and has no disabled Match CTA.                                                                                             |
| Single candidate    | The prototype enters the result directly at lines 5867–5885 and changes the result semantics at lines 6157–6205: single-candidate copy, no comparison claim, and no reselect action. Result-shell reference: [390px](screenshots/501-mockup-result-mobile-390.png). | [Single desktop](screenshots/501-implementation-single-desktop.png)         | [Single 390px](screenshots/501-implementation-single-mobile-390.png)                                                                                 | Aligned: explicit “只有这家候选”, one-candidate context, result facts and external actions; no round count and no “再选一次”.                                                                                                                |
| Pairwise comparison | [Comparison desktop](screenshots/501-mockup-comparison-desktop.png)                                                                                                                                                                                                 | [Comparison desktop](screenshots/501-implementation-comparison-desktop.png) | Mockup: [390px](screenshots/501-mockup-comparison-mobile-390.png). Implementation: [390px](screenshots/501-implementation-comparison-mobile-390.png) | Aligned: two fixed columns, card-first hierarchy, heat count, facts, owner-specific difference chips, aligned choices and collapsible detailed comparison. Both implementation captures show the same pair in the same order.                |
| Result              | The checked-in result structure and action order are at lines 4095–4152 and 6138–6205. Earlier result-shell capture: [390px](screenshots/501-mockup-result-mobile-390.png).                                                                                         | [Result desktop](screenshots/501-implementation-result-desktop.png)         | [Result 390px](screenshots/501-implementation-result-mobile-390.png)                                                                                 | Aligned: selected restaurant, scope and candidate count, three fact columns, final factual difference, Google Maps primary, OpenRice secondary, “再选一次” tertiary, and X close. Both captures show the same winner and fresh-result state. |

## Intentional differences

- The implementation uses the existing #500 CUpedia panel and modal surfaces,
  type scale, line-art fallback, and purple accent. Tinder/Bumble influence is
  limited to direct card selection; it does not replace the map's visual
  system.
- The checked-in prototype is the authoritative result-action reference. Some
  earlier PNG captures predate the approved Google Maps / OpenRice action
  hierarchy; the implementation follows the current prototype and #501 ticket,
  not the obsolete button text in those older captures.
- The implementation opens as a full-height mobile modal and a centred 32rem
  desktop modal. This is a responsive-mechanics change only: ordering, focus,
  comparison alignment, and action meaning remain unchanged.
- Restaurant artwork is data-driven. When the fixture has no image URL, the
  implementation deliberately uses the same restrained line-art fallback
  rather than manufacturing a restaurant photo.

## Interaction acceptance

- Zero, one, two, and multiple-candidate paths are automated.
- Champion side is stable between rounds; choosing the challenger is the only
  event that changes it.
- Details are read-only and return focus to their caller without changing the
  pair or shared gallery index.
- A choice briefly marks the selected/exiting cards, makes the action group
  busy, and disables both choices before the next round. Reduced motion uses a
  10ms transition.
- Completed results persist across refresh, reopen read-only, and reselect only
  from the frozen eligible candidate set.
- There is no undo, hidden keyboard undo, return-to-map result action, check-in,
  “今晚吃”, or post-Match flow.
- Modal focus entry, Tab/Shift+Tab containment, Escape, nested detail focus
  return, background isolation, safe-area padding, and 320px/390px geometry are
  covered by the production-mode E2E suite.

## Evidence note

The current in-app browser security policy does not permit scripted inspection
of the local `file://` prototype tab. It was not bypassed by serving the file or
using another browser. Existing mockup captures are retained above, and the
exact checked-in source branches are cited for states that were not previously
captured as dedicated PNGs. The implementation captures are fresh runtime
screenshots from this branch.
