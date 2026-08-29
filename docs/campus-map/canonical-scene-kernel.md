# Campus Map canonical scene kernel

Issue: #644 introduced the pure kernel as an expand step. #645 subsequently
made its driver the AMap prototype's single owner for history, camera, focus,
and Sheet commands; #646 now attaches the edit-session owner to that same
driver. References below to the old #593 runtime describe the kernel's original
delivery boundary, not the current product wiring.

The scene and catalog names are navigation vocabulary, not a persistence
model. In particular, a `facility` scene selects the canonical Place described
by the [Campus Map domain language](./CONTEXT.md); it does not create a second
Facility identity or make the scene catalog the source of map facts.

## Public seams

- `transitionCampusMapSession(session, event, catalog)` is the only product
  transition seam. It is pure and returns the next session plus declarative
  commands.
- `resolveCampusMapScene(session, catalog)` validates the session and derives
  the building, floor, and category context required by a projection.
- The versioned URL codec is the only persistent scene seam. Browser history
  stores only a versioned ownership marker and navigation depth; Back/Forward
  restores the scene from the canonical URL.
- `CampusMapBrowseProjectionStore` owns one stable scene-catalog object and
  exposes only its read-only view to the URL codec, driver, and UI projection.
  A successful refresh replaces that catalog before publishing the matching
  projection snapshot, so readers cannot observe facts and navigation identity
  from different generations.
- `CampusMapSceneDriver.openPublishedPlace(placeId, intentToken)` is the
  publish-only driver handoff. After the caller refreshes and replaces the
  shared catalog, it validates the Place through the same semantic resolver,
  rejects superseded tokens, and replaces the current task history entry with
  the canonical Place. It is not a `RESTORE` event and never adds a task entry
  that Back can reopen.
- Provider-target lookup failures are driver-owned transient Panel state with
  their own `peek` snap, not a scene or a second React selection owner. They
  write no URL/history entry, accept only the intent token that requested them,
  and are cleared by dismiss or a newer canonical navigation.

`scene-semantics.ts` is an internal seam, not a second product API. Its single
resolver owns session validity, catalog-derived context, restore focus,
contribution anchors, and the persistent/transient projection consumed by the
kernel and codecs.

## Canonical state matrix

| Mode   | Discriminant       | Canonical fields                         | Derived from catalog                             | URL policy                     |
| ------ | ------------------ | ---------------------------------------- | ------------------------------------------------ | ------------------------------ |
| browse | `map`              | none                                     | none                                             | base URL                       |
| browse | `search-results`   | normalized query, snap                   | none                                             | query + snap                   |
| browse | `category-results` | category ID, snap                        | category validity                                | category + snap                |
| browse | `building`         | building ID, optional chosen floor, snap | floor validity                                   | building + chosen floor + snap |
| browse | `facility`         | stable Place ID, fixed compact `peek`    | nullable building/floor, category, camera target | Place ID + `snap=peek` only    |
| browse | `content`          | content ID, snap                         | building, floor, category                        | content + snap only            |
| browse | `provider-poi`     | provider ID, POI ID, name, position      | none                                             | transient; normalizes to map   |
| task   | `create` / `edit`  | contribution anchor or stable Place ID   | anchor / Place identity                          | task + anchor or Place ID      |

The union is mutually exclusive. There are no optional selection fields that
can combine two scenes, and facility/content scenes cannot carry duplicated
building, floor, or category fields.

## Event and command matrix

`history`, `camera`, and `focus` are scalar command slots, so a transition
cannot emit more than one command of each kind.

| Event                | Accepted from                           | Next scene                             | History                                           | Camera                                                                                                           | Focus                             |
| -------------------- | --------------------------------------- | -------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `OPEN_MAP`           | any browse scene                        | map                                    | replace                                           | cancel                                                                                                           | map                               |
| `SEARCH`             | browse                                  | search-results, or map for blank query | replace                                           | cancel                                                                                                           | search input                      |
| `OPEN_CATEGORY`      | browse                                  | category-results                       | entity detail: push; other browse scenes: replace | cancel                                                                                                           | results                           |
| `OPEN_BUILDING`      | browse                                  | building                               | push                                              | focus building using #593 reason                                                                                 | heading                           |
| `OPEN_FACILITY`      | browse                                  | facility                               | push                                              | map/search source focuses the public Place point or available Building anchor; no target/building source cancels | heading                           |
| `OPEN_CONTENT`       | browse                                  | content                                | push                                              | map source focuses derived building; building source cancels                                                     | heading                           |
| `OPEN_PROVIDER_POI`  | browse                                  | provider-poi                           | none                                              | cancel                                                                                                           | heading (shared lightweight card) |
| `SET_SNAP`           | non-facility sheet-bearing browse scene | same identity, new snap                | replace                                           | none                                                                                                             | panel heading when expanded       |
| `SET_BUILDING_FLOOR` | building                                | same building, validated floor         | replace                                           | none                                                                                                             | results                           |
| `START_CREATE`       | browse                                  | create task                            | push                                              | cancel                                                                                                           | contribution form                 |
| `START_EDIT`         | browse                                  | edit task with stable Place ID         | push                                              | cancel                                                                                                           | contribution form                 |
| `CANCEL_TASK`        | task                                    | anchor projection or map               | back-or-push                                      | cancel                                                                                                           | scene heading                     |
| `RESTORE`            | any                                     | normalized decoded session             | none                                              | derived entity focus or cancel                                                                                   | matching result or scene focus    |

Events outside the listed source scenes, unknown catalog IDs, invalid
coordinates, and invalid floors are explicitly rejected with no state change
and no commands.

Repeating an intent whose canonical identity and payload already match the
current scene is accepted as an idempotent no-op with no commands.

History is projected from an internal navigation class instead of being a
fixed property of an event: `enter` maps to `push`, `refine` to `replace`,
`return` to `back-or-push`, and `restore`, `transient`, and `noop` to no history
command. This is why entering category results from an entity detail is
returnable while switching result filters replaces the current entry.

## Invariants

1. `CampusMapSession` is either one browse scene or one contribution task.
2. A facility/content scene stores only its entity ID and sheet policy. A
   facility uses stable `placeId` as its only required identity and always
   persists as the compact `peek` card; nullable Building/Floor context,
   category, and camera target are validated and derived from the catalog.
   Content keeps its required Building/Floor relationship and mutable snap.
3. A canonical URL never repeats catalog relationships. Provider POIs are
   transient and therefore normalize to map in the URL codec; popstate restores
   that URL scene and never resurrects their transient card.
4. URL and history metadata carry an explicit version. Unknown versions,
   malformed or repeated URL fields, conflicting legacy relationship fields,
   and missing catalog entities fall back safely. Invalid history metadata
   resets navigation depth without becoming a second scene source.
5. URL encode/decode is stable after normalization:
   `decode(encode(session)) === normalize(session)`. A legacy Facility
   `snap=full` normalizes to its compact `peek` card in the single semantic
   persistence projection. History metadata encode/decode independently
   round-trips navigation depth.
6. `RESTORE` represents popstate/Back/Forward. It emits no history command, so
   restore cannot write another browser-history entry. A direct Place link
   falls back to its Building when that context exists, otherwise to the map.
7. The kernel imports #593 command contracts but never calls browser, DOM, or
   AMap APIs and does not implement provider gesture, camera execution,
   browser-history, or MarkerCluster failure behavior.
8. #644 itself did not connect the UI. The formal `/campus-map` runtime is
   connected through the #645 driver and projects its browse/edit UI from that
   owner; it does not copy or synchronize legacy session fields or create a
   second session/kernel. `/prototype/campus-map` only redirects to that route.
9. The 8 × 13 scene-by-event-type baseline asserts the exact next session and
   all three command slots for every cell. Payload-sensitive branches such as
   entity `source` and semantic `RESTORE` targets have separate exact contract
   tables; a cell count alone does not claim complete event coverage.
10. Catalog validity, derived building context, restore focus, contribution
    anchors, and persistence eligibility have one internal semantic resolver.
    The transition and codec modules consume that projection instead of
    re-deriving scene meaning independently. Catalog entity IDs must be own
    properties so untrusted deep-link IDs cannot resolve through the object
    prototype; JSON-shaped entity values are checked for required fields. Every
    catalog, relationship, session, and task-anchor ID is canonical only when it
    is a non-empty string equal to its trimmed value. Non-canonical identities
    are rejected or fall back; codecs never trim them into a different identity.
11. Runtime facts and catalog identity advance as one projection-store
    generation. Components must not copy the catalog or manually synchronize a
    second driver catalog after refresh.
