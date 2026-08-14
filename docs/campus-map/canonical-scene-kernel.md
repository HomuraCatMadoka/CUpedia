# Campus Map canonical scene kernel

Issue: #644. This is the expand step only: the existing AMap prototype keeps
using the #593 session and runtime while later work migrates UI projections to
this kernel.

## Public seams

- `transitionCampusMapSession(session, event, catalog)` is the only product
  transition seam. It is pure and returns the next session plus declarative
  commands.
- `resolveCampusMapScene(session, catalog)` validates the session and derives
  the building, floor, and category context required by a projection.
- The versioned URL and history codecs are the only persistence seams. Decode
  always validates through the catalog and falls back safely.

## Canonical state matrix

| Mode   | Discriminant       | Canonical fields                         | Derived from catalog            | URL policy                     |
| ------ | ------------------ | ---------------------------------------- | ------------------------------- | ------------------------------ |
| browse | `map`              | none                                     | none                            | base URL                       |
| browse | `search-results`   | normalized query, snap                   | none                            | query + snap                   |
| browse | `category-results` | category ID, snap                        | category validity               | category + snap                |
| browse | `building`         | building ID, optional chosen floor, snap | floor validity                  | building + chosen floor + snap |
| browse | `facility`         | facility ID, snap                        | building, floor, category       | facility + snap only           |
| browse | `content`          | content ID, snap                         | building, floor, category       | content + snap only            |
| browse | `provider-poi`     | provider ID, POI ID, name, position      | none                            | transient; normalizes to map   |
| task   | `create`           | contribution anchor                      | building validity when anchored | task + anchor only             |

The union is mutually exclusive. There are no optional selection fields that
can combine two scenes, and facility/content scenes cannot carry duplicated
building, floor, or category fields.

## Event and command matrix

`history`, `camera`, `focus`, and `overlay` are scalar command slots, so a
transition cannot emit more than one command of each kind.

| Event                | Accepted from              | Next scene                             | History      | Camera                                                       | Focus / overlay                     |
| -------------------- | -------------------------- | -------------------------------------- | ------------ | ------------------------------------------------------------ | ----------------------------------- |
| `OPEN_MAP`           | any browse scene           | map                                    | replace      | cancel                                                       | map / close external                |
| `SEARCH`             | browse                     | search-results, or map for blank query | replace      | cancel                                                       | search input / close external       |
| `OPEN_CATEGORY`      | browse                     | category-results                       | push         | cancel                                                       | results / close external            |
| `OPEN_BUILDING`      | browse                     | building                               | push         | focus building using #593 reason                             | heading / close external            |
| `OPEN_FACILITY`      | browse                     | facility                               | push         | map source focuses derived building; building source cancels | heading / close external            |
| `OPEN_CONTENT`       | browse                     | content                                | push         | map source focuses derived building; building source cancels | heading / close external            |
| `OPEN_PROVIDER_POI`  | browse                     | provider-poi                           | none         | cancel                                                       | provider overlay                    |
| `SET_SNAP`           | sheet-bearing browse scene | same identity, new snap                | replace      | none                                                         | panel heading when expanded         |
| `SET_BUILDING_FLOOR` | building                   | same building, validated floor         | replace      | none                                                         | results                             |
| `START_CREATE`       | browse                     | create task                            | push         | cancel                                                       | contribution form / close external  |
| `CANCEL_TASK`        | task                       | anchor projection or map               | back-or-push | cancel                                                       | scene heading                       |
| `RESTORE`            | any                        | normalized decoded session             | none         | derived entity focus or cancel                               | scene projection / matching overlay |

Events outside the listed source scenes, unknown catalog IDs, invalid
coordinates, and invalid floors are explicitly rejected with no state change
and no commands.

## Invariants

1. `CampusMapSession` is either one browse scene or one contribution task.
2. A facility/content scene stores only its entity ID and sheet snap. Its
   building, floor, and category are validated and derived from the catalog.
3. A canonical URL never repeats catalog relationships. Provider POIs are
   transient and therefore normalize to the map URL.
4. URL and history formats carry an explicit version. Unknown versions,
   malformed payloads, conflicting legacy relationship fields, and missing
   catalog entities fall back to the empty map session.
5. Encode/decode is stable after normalization:
   `decode(encode(session)) === normalize(session)`.
6. `RESTORE` represents popstate/Back/Forward. It emits no history command, so
   restore cannot write another browser-history entry.
7. The kernel imports #593 command contracts but never calls browser, DOM, or
   AMap APIs and does not implement provider gesture, camera execution,
   overlay lifecycle, browser-history, or MarkerCluster failure behavior.
8. This ticket does not connect the existing UI to the new kernel and does not
   copy or synchronize the legacy session fields.
