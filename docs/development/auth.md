# Authentication maintenance

Status: Current
Last verified: 2026-09-07

The runtime source of truth is `src/lib/auth.ts`; the identity tables are in
`src/db/schema.ts`.

## Better Auth 1.7 session refresh upgrade

Issue [#893](https://github.com/HomuraCatMadoka/CUpedia/issues/893) upgrades
Better Auth from 1.6.11 to stable 1.7.3. The selected release contains the
[single-owner session fetch fix](https://github.com/better-auth/better-auth/pull/8760):
the session atom performs requests, while focus, online, and cross-tab managers
only decide when to ask it to refresh.

The [1.7.3 release notes](https://github.com/better-auth/better-auth/releases/tag/v1.7.3)
also restore the 1.6 account core schema and enable startup schema validation by
default. Production-shaped registration, password and OTP login, logout,
account completion, redirect, and session tests all pass against the existing
Drizzle tables. This upgrade needs no migration or data backfill.

Two compatibility details are intentional:

- Better Auth requires its core `user.name` to be a string. Historical OTP-only
  users can have `users.name = NULL`, while CUpedia's canonical, non-null public
  name is `users.nickname`. `user.fields.name` therefore maps the core field to
  `nickname`. Both `name` and `nickname` inputs on Better Auth's update endpoint
  pass through the repository nickname validator.
- `better-call@1.4.0` declares a Zod 4 peer. pnpm otherwise resolved that peer
  against the repository's transitive Zod 3 copy and reported an unmet peer, so
  Zod 4.5.4 is an explicit runtime dependency even though application source
  does not import it directly.

An old cookie containing `user.name = null` can miss once immediately after the
upgrade. The server then reads the database and replaces it with a valid cookie;
subsequent reads use the cookie cache.

## Refresh behavior and evidence

The supported behavior is:

- an initial page mount makes one session request;
- a visible-tab return or reconnect makes at most one request, and focus bursts
  inside five seconds are coalesced;
- a login in another tab is observed when the user returns to the original tab;
- logout is broadcast and updates the other open tab immediately.

The dependency ablation used the same event sequence three times. Better Auth
1.6.11 made two session requests per eligible focus or reconnect event; 1.7.3
made one. Both versions made one initial request, coalesced the rapid burst, and
handled a cross-tab event once.

Because automated Chromium keeps Playwright pages visible, the committed E2E
test dispatches the exact `visibilitychange` event consumed by Better Auth. A
separate ordinary Chrome test used two real macOS tabs: initial load made one
request, returning after six seconds added one, and five rapid tab round trips
added none. Temporary request logging used for that measurement was removed.
