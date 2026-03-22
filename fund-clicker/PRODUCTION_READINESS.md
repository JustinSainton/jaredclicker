# Fund Clicker Production Readiness

Status: in progress
Last updated: 2026-03-21

This file turns the Codex review into an execution log. Items move from `open` to
`in_progress` to `done` as the codebase is hardened.

## Review Findings

### Authority and security

- [x] `Critical` Player identity is not enforced on WebSocket actions.
  Impact: score spoofing, chat impersonation, unauthorized challenges, arbitrary game moves.
  References:
  - `worker/src/org-game.js`
  - `mobile/context/GameContext.js`

- [x] `Critical` Paid mutations are client-authorized instead of server-authorized.
  Impact: anyone can mint sabotage credits, cut coins, unlock skins, or break free without payment.
  References:
  - `worker/src/index.js`
  - `worker/src/org-game.js`
  - `mobile/lib/payments.js`

- [x] `High` Admin auth storage and boundaries are too weak for a payments product.
  Impact: unsalted password hashes, ambiguous email lookup across orgs, broad stats exposure.
  References:
  - `worker/src/auth.js`
  - `worker/src/index.js`
  - `worker/migrations/0001_initial.sql`

### Payments and analytics

- [x] `High` Stripe reconciliation is incomplete.
  Impact: no durable payment ledger, no analytics rollups, no authoritative entitlement execution.
  References:
  - `worker/src/index.js`
  - `worker/src/stripe.js`
  - `worker/migrations/0002_funds_and_analytics.sql`

- [x] `High` Raised-total broadcasts are disconnected from real payment events.
  Impact: UI claims fundraiser progress that is not tied to stored transactions.
  References:
  - `worker/src/index.js`
  - `worker/src/org-game.js`
  - `mobile/components/ClickerScreen.js`

### Consistency and completeness

- [x] `High` Org config updates are not propagated into the Durable Object runtime.
  Impact: stale branding, stale custom trivia, divergence between D1 and live game behavior.
  References:
  - `worker/src/index.js`
  - `worker/src/org-game.js`

- [x] `High` Multiple advertised features are only partial or dead contracts.
  Impact: runtime failures for campaigns, skins data, spectating, and group game variants.
  References:
  - `worker/src/org-game.js`
  - `mobile/components/CampaignsList.js`
  - `mobile/components/SkinsScreen.js`
  - `mobile/components/SpectatorView.js`
  - `mobile/components/GroupGameLobby.js`
  Resolution: shipping UI now exposes only supported flows; skins data is implemented and unsupported battle variants are removed from the release path.

- [x] `Medium` i18n coverage is overstated.
  Impact: hardcoded English remains in many screens, doc claim is inaccurate.
  References:
  - `mobile/lib/i18n.js`
  - `mobile/components/*`
  - `mobile/app/*`
  Resolution: the hardcoded-copy audit now passes; shipping screens, admin tools, campaigns, spectator UI, and battle minigames route user-facing copy through `mobile/lib/i18n.js`.

### Release readiness

- [x] `Medium` Mobile release configuration is incomplete.
  Impact: placeholder Stripe publishable key, missing notification asset, push registration issues.
  References:
  - `mobile/app/_layout.js`
  - `mobile/app.json`
  - `mobile/hooks/usePushNotifications.js`

- [x] `Medium` Live Activities are not fully wired.
  Impact: shipping claim without a working native bridge / extension setup.
  References:
  - `mobile/hooks/useLiveActivity.js`
  - `mobile/plugins/live-activity-plugin.js`
  - `mobile/ios-widgets/FundClickerWidgets.swift`
  Resolution: Live Activities are removed from the shipping Expo config until a real native bridge exists.

### Verification

- [x] `High` No automated verification exists for critical flows.
  Impact: regressions will slip into auth, payment, and real-time gameplay.
  Resolution: added worker unit coverage for password hashing/rehash, server-side payment policy enforcement, and Stripe-to-DO reconciliation happy/failure paths.

## Execution Program

This follows an `autoresearch`-style loop:

1. Pick one narrow production objective.
2. Define the exploit or workflow that must pass.
3. Make the smallest coherent code change that fixes it.
4. Verify locally.
5. Keep only changes that improve the measured result.

## Current Iteration

### Iteration 1

Goal: make player identity and paid mutations server-authoritative.

Planned outputs:

- authenticated WebSocket identity handshake
- token-gated DO mutation endpoints
- server-side entitlement execution path for Stripe webhooks
- client updates to use the new authority model

Observed result:

- done: player-bearing HTTP and WebSocket actions now require verified account tokens
- done: payment fulfillment is server-authoritative, idempotent, and Stripe-backed
- done: pricing is enforced on the server instead of trusting mobile payloads

### Iteration 2

Goal: make the mobile app and admin surface shippable without unsupported claims.

Observed result:

- done: unsupported campaigns, spectating, and group battle entry points are removed from the shipping UI
- done: push registration now uses the correct Expo constants path and a real notification asset exists
- done: release builds require `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- done: Live Activities are removed from Expo config until the native bridge is real

### Iteration 3

Goal: harden stored credentials and add repeatable verification.

Observed result:

- done: org admin passwords and player PINs use PBKDF2 with legacy-hash upgrade on login
- done: admin login verifies in application code, preventing ambiguous email/password SQL matches
- done: worker test coverage exists for auth hashing and server-side payment policy

### Iteration 4

Goal: close the raw-copy i18n backlog and deepen payment reconciliation verification.

Observed result:

- done: `npm run i18n:report` in `mobile/` now reports no hardcoded copy candidates
- done: game modals, minigames, admin surfaces, campaigns, and spectator views now resolve user-facing strings via `mobile/lib/i18n.js`
- done: worker tests now cover Stripe reconciliation idempotency plus failed entitlement rollback behavior

### Iteration 5

Goal: restore local Expo buildability after the mobile dependency drift surfaced.

Observed result:

- done: `mobile/package.json` now pins `react-dom` to the same React version and explicitly declares `react-native-web`
- done: `npm install` in `mobile/` restored the missing `@stripe/stripe-react-native` dependency and updated `mobile/package-lock.json`
- done: `npx expo config --type public` now resolves successfully with the Stripe config plugin enabled

### Iteration 6

Goal: validate native generation paths and reduce translation fallback in the newly centralized UI copy.

Observed result:

- done: added `expo-system-ui` so Android prebuild no longer warns about `userInterfaceStyle`
- done: `expo prebuild --platform ios --no-install` passes in a clean temp workspace snapshot
- done: `expo prebuild --platform android --no-install` passes in a clean temp workspace snapshot
- done: Spanish, Portuguese, French, German, Japanese, and Korean now include translations for the newly centralized battle, admin, campaign, spectator, and group-game copy
- done: `npm run i18n:report` still passes after the locale backfill

## Remaining Gaps

- `Medium` Translation catalog depth is improved but still incomplete. Secondary locales now cover the newly centralized battle/admin/campaign flows, but broader historical UI copy still falls back to English in places.
  Tracking: `I18N_WORKSTREAM.md`
  Current support: the raw-copy audit is clean, the recently centralized shipping copy is backfilled for `es`, `pt`, `fr`, `de`, `ja`, and `ko`, and new screens should continue routing through `mobile/lib/i18n.js`.
- `Medium` There is still no EAS build validation in this workspace snapshot.
