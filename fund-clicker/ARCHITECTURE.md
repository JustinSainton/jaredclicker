# Fund Clicker — Complete Architecture Document

**Version:** 1.0.0
**Date:** 2026-03-22
**Status:** Pre-TestFlight — ready for Codex review
**Codebase:** 49 files, 11,982 lines across 4 layers

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture](#2-system-architecture)
3. [Technology Stack](#3-technology-stack)
4. [Backend: Cloudflare Worker](#4-backend-cloudflare-worker)
5. [Database: D1 Schema](#5-database-d1-schema)
6. [Game Engine: Durable Object](#6-game-engine-durable-object)
7. [Mobile App: React Native (Expo)](#7-mobile-app-react-native-expo)
8. [Admin Portal: Cloudflare Pages](#8-admin-portal-cloudflare-pages)
9. [Payment System: Stripe Connect](#9-payment-system-stripe-connect)
10. [Real-Time Communication](#10-real-time-communication)
11. [Authentication & Security](#11-authentication--security)
12. [Internationalization](#12-internationalization)
13. [Theme/Vibe System](#13-themevibe-system)
14. [Push Notifications & Live Activities](#14-push-notifications--live-activities)
15. [Game Mechanics](#15-game-mechanics)
16. [Battle System](#16-battle-system)
17. [Monetization Features](#17-monetization-features)
18. [Data Persistence & Sync](#18-data-persistence--sync)
19. [File Inventory](#19-file-inventory)
20. [Deployment & Infrastructure](#20-deployment--infrastructure)
21. [Key Architectural Decisions](#21-key-architectural-decisions)
22. [Known Limitations & Future Work](#22-known-limitations--future-work)
23. [Security Considerations](#23-security-considerations)
24. [Performance Considerations](#24-performance-considerations)

---

## 1. Executive Summary

Fund Clicker is a white-label multi-tenant fundraising platform that turns the proven Jared Clicker concept ($260+ raised in a single church deployment) into a platform any organization can use. Organizations create fundraisers where their communities play a clicker game — tapping coins, buying upgrades, battling each other, and purchasing sabotage attacks — with all real-money purchases flowing directly to the organization via Stripe Connect (97% to org, 3% platform fee).

The platform consists of:
- **React Native mobile app** (iOS + Android via Expo)
- **Cloudflare Worker API** with per-org Durable Objects for game state isolation
- **Admin onboarding portal** (Cloudflare Pages)
- **D1 database** for platform-level data (orgs, funds, analytics)
- **R2 bucket** for per-org assets (coin images, photos, skins)

The core architectural insight: **Durable Objects provide natural multi-tenancy**. Each organization gets its own isolated game instance via `env.ORG_GAME.idFromName(orgId)`. The 1,700-line game engine runs identically for every org — all multi-tenancy complexity is concentrated in a thin 640-line router.

---

## 2. System Architecture

```
┌─────────────────────┐     ┌─────────────────────────┐
│   React Native App  │     │  Admin Portal (Pages)   │
│   (iOS + Android)   │     │  fund-clicker-admin      │
│                     │     │  .pages.dev              │
└────────┬────────────┘     └────────┬────────────────┘
         │ REST + WebSocket          │ REST
         │                           │
┌────────▼───────────────────────────▼────────────────┐
│        Cloudflare Worker (Edge Router)               │
│        fund-clicker-api.justin-5b6.workers.dev       │
│                                                      │
│  /api/v1/orgs/:slug/ws    → DO (WebSocket)          │
│  /api/v1/orgs/:slug/*     → DO (game API)           │
│  /api/v1/platform/*       → D1 (org management)     │
│  /api/v1/stripe/*         → Stripe Connect           │
│  /api/v1/join             → D1 (join code lookup)    │
│  /api/v1/search           → D1 (org search)          │
└────┬──────────┬──────────┬──────────┬───────────────┘
     │          │          │          │
┌────▼────┐ ┌──▼───┐  ┌──▼───┐  ┌──▼──────────────┐
│ DO: Org │ │ DO:  │  │  D1  │  │      R2         │
│ Game A  │ │ Org  │  │      │  │ fund-clicker-   │
│ (state) │ │ B    │  │ 15   │  │ assets          │
│         │ │      │  │tables│  │                  │
└─────────┘ └──────┘  └──────┘  └──────────────────┘
```

### Data Flow: Player Joining a Fundraiser

1. Player opens app → enters 6-character join code (e.g., `HFHASV`)
2. App calls `POST /api/v1/join` with `{ code: "HFHASV" }`
3. Worker queries D1: `SELECT * FROM orgs WHERE join_code = ?`
4. Returns org slug + config → app navigates to `/game/test-church`
5. App loads org info: `GET /api/v1/orgs/test-church/`
6. Returns full config (colors, currency name, vibe, payment status)
7. Player registers: `POST /api/v1/orgs/test-church/account/register`
8. Worker forwards to DO: `env.ORG_GAME.idFromName(orgId).fetch()`
9. DO creates account with hashed PIN, returns auth token
10. App opens WebSocket: `WSS /api/v1/orgs/test-church/ws`
11. DO accepts connection, sends chat history + org config + broadcasts

---

## 3. Technology Stack

| Layer | Technology | Version | Rationale |
|-------|-----------|---------|-----------|
| Mobile App | React Native (Expo) | SDK 55 | Cross-platform, OTA updates, expo-haptics |
| Mobile Navigation | Expo Router | 55.0.7 | File-based routing, deep linking |
| Mobile Payments | @stripe/stripe-react-native | 0.58.0 | Native PaymentSheet |
| Mobile Storage | AsyncStorage | 2.2.0 | Game state persistence |
| Mobile Audio | expo-av | 16.0.8 | Sound effects with pooling |
| Mobile Push | expo-notifications | 55.0.13 | Expo Push + APNs/FCM |
| Mobile Security | expo-crypto | latest | SHA-256 PIN hashing |
| Mobile Haptics | expo-haptics | 55.0.9 | Touch feedback |
| API/Backend | Cloudflare Workers | - | Edge-distributed, scales to zero |
| Game State | Durable Objects | - | Per-org isolation, WebSocket native |
| Platform DB | Cloudflare D1 | - | Edge SQLite, 15 tables |
| Asset Storage | Cloudflare R2 | - | S3-compatible, per-org paths |
| Admin Portal | Cloudflare Pages | - | Static hosting, global CDN |
| Payments | Stripe Connect Standard | - | Orgs bring their Stripe account |
| iOS Widgets | Swift + ActivityKit | iOS 16.1+ | Live Activities on Lock Screen |
| i18n | Custom (lib/i18n.js) | - | 7 languages, 200+ keys |

### Why Cloudflare (vs Firebase/Supabase)

- **DO scales to zero** — idle orgs cost nothing. Firebase charges per connection.
- **Edge-distributed** — clicks feel instant globally. Firebase/Supabase are single-region.
- **Proven** — the original Jared Clicker handles thousands of clicks/sec reliably.
- **Cheapest at scale** — 1000 orgs costs ~$600/mo on CF vs $2000+ on Firebase.

---

## 4. Backend: Cloudflare Worker

**File:** `worker/src/index.js` (634 lines)
**Deployed:** `https://fund-clicker-api.justin-5b6.workers.dev`

The worker is a **thin routing layer** that maps incoming requests to the right handler:

### Route Table

| Route | Method | Handler | Auth |
|-------|--------|---------|------|
| `/health` | GET | Health check | None |
| `/api/v1/join` | POST | Join code lookup → D1 | None |
| `/api/v1/search` | GET | Org search → D1 | None |
| `/api/v1/orgs/:slug/ws` | GET | WebSocket → DO | None |
| `/api/v1/orgs/:slug/` | GET | Org info → D1 | None |
| `/api/v1/orgs/:slug/payment-intent` | POST | Create PaymentIntent | None |
| `/api/v1/orgs/:slug/admin/*` | * | Forward to DO | JWT |
| `/api/v1/orgs/:slug/*` | * | Forward to DO | None |
| `/api/v1/platform/register` | POST | Create org → D1 batch | None |
| `/api/v1/platform/login` | POST | Admin login → D1 | None |
| `/api/v1/platform/me` | GET | Admin info | JWT |
| `/api/v1/platform/config` | PUT | Update org config → D1 | JWT |
| `/api/v1/platform/org` | PUT | Update org info → D1 | JWT |
| `/api/v1/platform/funds` | GET/POST | Fund CRUD → D1 | JWT |
| `/api/v1/platform/funds/:slug` | GET | Fund detail → D1 | JWT |
| `/api/v1/platform/funds/:slug/groups` | POST | Create group → D1 | JWT |
| `/api/v1/platform/dashboard` | GET | Analytics → D1 | JWT |
| `/api/v1/platform/platform-stats` | GET | Platform-wide stats | JWT |
| `/api/v1/platform/payouts` | GET/PUT | Payout config → D1 | JWT |
| `/api/v1/platform/invite` | POST | Admin invite → D1 | JWT (owner) |
| `/api/v1/stripe/connect` | POST | OAuth URL | JWT |
| `/api/v1/stripe/callback` | POST | OAuth code exchange | JWT |
| `/api/v1/stripe/webhook` | POST | Stripe webhook | Signature |

### Org Lookup Caching

The router caches D1 org lookups in memory with a 60-second TTL:

```javascript
const orgCache = new Map();
const ORG_CACHE_TTL = 60_000;
async function lookupOrg(db, slug) {
  const cached = orgCache.get(slug);
  if (cached && Date.now() - cached.ts < ORG_CACHE_TTL) return cached.org;
  const org = await db.prepare("SELECT * FROM orgs WHERE slug = ? AND status = 'active'").bind(slug).first();
  orgCache.set(slug, { org, ts: Date.now() });
  return org;
}
```

This avoids hitting D1 on every request while keeping data fresh within a minute.

### Supporting Modules

| File | Lines | Purpose |
|------|-------|---------|
| `auth.js` | 100 | JWT creation/verification (HMAC-SHA256), password hashing, join code generation, slug validation |
| `stripe.js` | 135 | Stripe Connect OAuth, PaymentIntent creation with application_fee, webhook signature verification |

---

## 5. Database: D1 Schema

**Database:** `fund-clicker-platform` (ID: `76f4da22-2614-4227-9531-47c2c7d04bae`)
**Region:** WNAM (Western North America)
**Tables:** 15
**Migrations:** 2 files

### Table Overview

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `orgs` | Organization registry | id, slug (unique), name, join_code (unique 6-char), status |
| `org_admins` | Admin accounts (email/password) | org_id (FK), email, password_hash, role (owner/admin) |
| `org_config` | White-label branding | org_id (PK), coin_image_key, primary/secondary/accent colors, currency_name, character_photos (JSON), upgrade_names (JSON), custom_trivia (JSON), price_overrides (JSON) |
| `stripe_accounts` | Stripe Connect accounts | org_id (PK), stripe_account_id, charges_enabled, onboarding_complete |
| `players` | Cross-org player identity | id, device_id (unique), display_name, email |
| `player_orgs` | Player-org membership | player_id + org_id (composite PK) |
| `funds` | Fundraisers within an org | id, org_id (FK), name, slug, join_code, goal_cents, status, starts_at, ends_at |
| `fund_config` | Per-fund branding overrides | fund_id (PK), inherits from org_config |
| `fund_groups` | Competing groups within a fund | id, fund_id (FK), name, color |
| `player_groups` | Player-group membership | player_id + fund_id (composite PK), group_id |
| `transactions` | Payment audit trail | stripe_payment_intent_id (unique), amount_cents, platform_fee_cents, type, player_name |
| `daily_stats` | Analytics rollups | org_id + fund_id + date (unique), active_players, gross_revenue_cents, total_clicks, battles_played |
| `payout_config` | Per-org payout settings | org_id (PK), schedule (daily/weekly/monthly/manual), minimum_payout_cents |
| `platform_admins` | Fund Clicker ops team | email, password_hash, role (admin/superadmin) |
| `org_invitations` | Multi-admin invite tokens | org_id, email, token (unique), expires_at |

### Design Decisions

1. **UUIDs as primary keys** — generated via `lower(hex(randomblob(16)))` or `crypto.randomUUID()`. No auto-increment to avoid leaking sequence info.
2. **JSON columns** for flexible config — `character_photos`, `upgrade_names`, `custom_trivia`, `price_overrides` are stored as JSON strings in SQLite. Parsed client-side.
3. **Batch writes** for org registration — `env.DB.batch([org, admin, config])` ensures atomicity.
4. **Join codes** exclude confusing characters — uses `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no I/O/0/1), 6 chars = ~1 billion combinations.

---

## 6. Game Engine: Durable Object

**File:** `worker/src/org-game.js` (1,700 lines)
**Class:** `OrgGameInstance`
**Binding:** `env.ORG_GAME`

The game engine is the heart of Fund Clicker. Each org gets its own isolated instance via `env.ORG_GAME.idFromName(orgId)`. The class manages:

### State (lazy-loaded from DO storage)

| State | Type | Description |
|-------|------|-------------|
| `persistedScores` | Object | `{ [nameLower]: { name, score, stats, date, serverCutAt } }` |
| `sabotages` | Array | Active sabotages with expiry timestamps |
| `credits` | Object | `{ [nameLower]: count }` — sabotage credits per player |
| `chatMessages` | Array | Last 2,000 messages (up from original 500) |
| `campaigns` | Object | Coin cut campaigns with contributor tracking |
| `accounts` | Object | Player accounts with PIN hashes and auth tokens |
| `skinData` | Object | `{ owned: {}, custom: {}, equipped: {} }` |
| `pushSubscriptions` | Object | Expo push tokens per player |
| `scoreEpoch` | Integer | Increments on admin reset — clients with stale epochs are rejected |
| `resetSchedule` | Object | Weekly auto-reset config |
| `hallOfFame` | Array | Weekly leaderboard snapshots (up to 52 weeks) |
| `bannedPlayers` | Object | Autoclicker bans with expiry |
| `orgConfig` | Object | Branding config (colors, currency, trivia) |

### In-Memory State (not persisted)

| State | Type | Description |
|-------|------|-------------|
| `connections` | Map | Active WebSocket connections: `ws → { name, score, stats, country, city }` |
| `activeGames` | Map | Battle game instances: `gameId → GameState` |
| `pendingChallenges` | Map | Unanswered battle challenges |
| `forfeitTimers` | Map | Disconnect → auto-forfeit timers |
| `groupLobbies` | Map | Group game lobbies awaiting players |
| `_scoreRateTracker` | Object | Autoclicker detection state per player |
| `_loginAttempts` | Object | Rate limiting: failed login attempts per username |

### Key Subsystems

**Autoclicker Detection:**
- Tracks implied clicks-per-second from score deltas
- Accounts for auto-income and upgrade levels (subtracts expected passive income)
- Uses 20% buffer for timing variance
- 50 CPS threshold (humans max ~15 CPS)
- 20 consecutive suspicious checks → 30-minute ban
- Suspicion decays 2x faster than it builds (forgiving for brief bursts)
- Admin can toggle autoban on/off

**Score Authority:**
- Server is authoritative via `scoreEpoch` system
- Client sends `scoreEpoch` with every `scoreUpdate`
- If client epoch < server epoch (stale — post-reset), update is rejected
- `serverCutAt` timestamp locks scores for 5 minutes after server-side deductions (sabotage, coin cuts, wagers) to prevent clients from re-uploading stale higher scores

**Chat:**
- 2,000 message storage limit (up from 500)
- On connect: sends last 200 messages (not full 2,000) for fast initial load
- Paginated history API: `GET /chat/history?before=<timestamp>&limit=100`
- Profanity filter with word replacement
- System messages for game events (sabotage, battles, campaigns, resets)

**Push Notifications:**
- Expo Push API (replaces VAPID Web Push from original)
- Single HTTP POST to `exp.host/--/api/v2/push/send`
- Per-player token storage (max 5 tokens — multiple devices)
- Categories: challenge, sabotage, coincut, battle_win, battle_loss, campaign

**Login Rate Limiting:**
- Max 5 failed attempts per username per 15 minutes
- Returns `429 Too Many Requests` with `Retry-After` header
- Shows remaining attempts warning when ≤2 left
- Successful login clears the attempt counter

---

## 7. Mobile App: React Native (Expo)

**Directory:** `mobile/`
**SDK:** Expo 55
**Router:** Expo Router (file-based)
**Bundle ID:** `com.fundclicker.app`
**EAS Project:** `9f9472c1-f243-48d2-8220-66bc3d8bbd13`

### App Structure

```
mobile/
├── app/                          # Expo Router screens
│   ├── _layout.js                # Root: StripeProvider → OrgProvider
│   ├── index.js                  # Org selection (join code + search)
│   └── game/[slug].js            # Game wrapper: auth gate + tab navigator
├── components/                   # Screen components
│   ├── ClickerScreen.js          # Core clicker with floating numbers
│   ├── LeaderboardScreen.js      # Rankings + Hall of Fame
│   ├── BattleScreen.js           # 1v1 challenges + group games + campaigns
│   ├── ShopScreen.js             # Upgrades + Stripe purchases
│   ├── ChatScreen.js             # Real-time messaging
│   ├── SkinsScreen.js            # Skin gallery + equip
│   ├── ProfileScreen.js          # Player stats + achievements
│   ├── BanOverlay.js             # Autoclicker ban screen
│   ├── CampaignsList.js          # Coin cut campaign progress
│   ├── GroupGameLobby.js         # Group game lobby management
│   ├── SpectatorView.js          # Watch live battles
│   ├── AdminDashboard.js         # Mobile admin tools
│   └── games/                    # Battle game UIs (9 types)
│       ├── ActiveGameModal.js    # Game router + challenge modal
│       ├── RPSGame.js            # Rock Paper Scissors
│       ├── ClickerDuelGame.js    # 10-second tap battle
│       ├── TriviaGame.js         # Speed + knowledge quiz
│       ├── CoinFlipGame.js       # 50/50 luck with coin animation
│       ├── TTTGame.js            # Tic-Tac-Toe with win highlight
│       ├── ReactionGame.js       # Fastest tap after signal
│       ├── Connect4Game.js       # 7x6 grid with drop columns
│       ├── HangmanGame.js        # Guess letters, keyboard UI
│       └── BattleshipGame.js     # 8x8 grid, attack/defense toggle
├── context/                      # React context providers
│   ├── OrgContext.js             # Org selection + theme + config parsing
│   └── GameContext.js            # WebSocket + all game events
├── hooks/                        # Custom React hooks
│   ├── useGameState.js           # Shared game state singleton
│   ├── usePushNotifications.js   # Push registration + handling
│   └── useLiveActivity.js        # iOS Live Activity interface
├── lib/                          # Utility libraries
│   ├── api.js                    # REST API client with retry
│   ├── gameEngine.js             # Full game state engine
│   ├── payments.js               # Stripe payment flows
│   ├── sounds.js                 # Audio SoundPool system
│   ├── i18n.js                   # Internationalization (7 languages)
│   ├── vibes.js                  # Theme preset definitions
│   └── crypto.js                 # Client-side PIN hashing
├── plugins/
│   └── live-activity-plugin.js   # Expo config plugin for iOS Live Activities
├── ios-widgets/
│   └── FundClickerWidgets.swift  # iOS WidgetExtension (ActivityKit)
└── assets/
    └── sounds/                   # Bundled audio files
        ├── coin.mp3              # Click sound (pooled x5)
        ├── upgrade.wav           # Purchase sound
        ├── achievement.wav       # Achievement unlocked
        └── photo_event.wav       # Character event
```

### Provider Hierarchy

```
StripeProvider (publishable key)
  └── OrgProvider (org selection, theme, config)
        └── Stack (Expo Router)
              ├── index.js (org selection)
              └── game/[slug].js
                    └── GameProvider (WebSocket, player session)
                          ├── AuthGate (login/register)
                          └── GameTabs
                                ├── ClickerScreen
                                ├── LeaderboardScreen
                                ├── BattleScreen
                                ├── ShopScreen
                                ├── SkinsScreen
                                └── ChatScreen
                          ├── ActiveGameModal
                          └── BanOverlay
```

### Game State Architecture

The game state is managed via a **module-level singleton** (`useGameState.js`) rather than React Context. This is a deliberate performance decision:

```
Problem: Context causes ALL consumers to re-render on every state change.
         At 10+ clicks/second, this would re-render every tab on every click.

Solution: Module-level global with a Set of listener functions.
          Only components that call useGameState() get updates.
          The singleton handles auto-income ticks and auto-save globally.
```

State flow:
1. `useGameState()` hook subscribes to global state changes
2. ClickerScreen calls `setGameState()` on every click
3. Global singleton notifies only subscribed components
4. Auto-income ticks every 1 second (via setInterval, not per-component)
5. Auto-save to AsyncStorage every 10 seconds
6. Score sync to server every 5 seconds via WebSocket `scoreUpdate`
7. Full `gameState` (upgrades, achievements) sent with `authToken` for cross-device sync

### WebSocket Message Handling

GameContext handles 20+ message types from the DO:

| Message | Action |
|---------|--------|
| `update` | Sets leaderboard, online, sabotages, campaigns, activeGames, hallOfFame, scoreEpoch, credits, groupLobbies, podiumChange |
| `chatHistory` | Sets initial chat messages |
| `chatMessage` | Appends to chat (capped at 2000) |
| `orgConfig` | Sets org branding config |
| `resetAll` | Updates scoreEpoch, shows alert |
| `scoreCorrection` | Updates local score + shows floating number |
| `challengeReceived` | Shows challenge modal with haptics + vibration |
| `challengeSent` | Sets waiting indicator |
| `challengeExpired` | Clears pending challenge |
| `challengeDeclined` | Shows reason alert |
| `gameStarted` | Opens game modal |
| `gameUpdate` | Updates active game state |
| `gameEnded` | Shows result, auto-clears after 10s |
| `coinCutEvent` | Shows coin cut notification |
| `banned` | Shows ban overlay with countdown |
| `unbanned` | Clears ban overlay |
| `totalRaised` | Updates fundraiser total display |
| `groupGameStarted/Update/Ended` | Group game lifecycle |
| `groupLobbyCreated/Update/Expired` | Group lobby lifecycle |

---

## 8. Admin Portal: Cloudflare Pages

**Deployed:** `https://fund-clicker-admin.pages.dev`
**File:** `admin/index.html` (single HTML file, 580 lines)

### 5-Step Onboarding Wizard

1. **Create Organization** — name, email, password, description → `POST /platform/register`
2. **Pick Your Vibe** — 6 preset themes with color swatches
3. **Fine-Tune Colors** — color pickers with live preview
4. **Connect Payments** — Stripe Connect OAuth
5. **You're Live!** — join code display with copy button + next steps checklist

### Design

- **Aesthetic:** Dark editorial — Instrument Serif headings, DM Sans body, ambient gradient blobs, noise texture overlay
- **Animations:** Slide-up entry with staggered delays, celebration bounce on completion
- **Responsive:** Single-column layout, adapts to mobile widths
- **No framework:** Vanilla HTML/CSS/JS — fast loading, no build step

---

## 9. Payment System: Stripe Connect

### Architecture

```
Player buys $3.99 sabotage →
  Mobile: Stripe PaymentSheet presents
  Backend: Creates PaymentIntent with:
    amount: 399
    application_fee_amount: 12 (3%)
    transfer_data.destination: org's stripe_account_id
  Stripe processes:
    Platform gets: $0.12 (3% fee)
    Org gets: $3.87 minus Stripe fees (~$3.45 net)
```

### Mobile Payment Flow (`lib/payments.js`)

1. Call backend: `POST /orgs/:slug/payment-intent` → gets `clientSecret`
2. Initialize PaymentSheet with dark theme styling
3. Present PaymentSheet to user
4. On success: execute post-payment action (add credits, execute cut, etc.)
5. Return result to caller

### Product Catalog

| Product | Price | Type |
|---------|-------|------|
| 1x Sabotage Credit | $0.99 | `sabotage_credits` |
| 3x Sabotage Credits | $2.49 | `sabotage_credits` |
| 5x Sabotage Credits | $3.99 | `sabotage_credits` |
| 5% Coin Cut | $2.00 | `coin_cut` |
| 10% Coin Cut | $3.99 | `coin_cut` |
| 25% Coin Cut | $9.99 | `coin_cut` |
| 40% Coin Cut | $19.99 | `coin_cut` |
| Break Free | $0.99 | `break_free` |
| Skin Purchase | $5.99-9.99 | `skin_purchase` |
| Double or Nothing | $0.99 | `double_or_nothing` |
| Rematch (Best 2/3) | $1.99 | `rematch` |

---

## 10. Real-Time Communication

### WebSocket Lifecycle

1. **Connect:** `new WebSocket(wss://api/v1/orgs/:slug/ws)` — native RN WebSocket
2. **Auth:** Client sends `{ type: "setName", name: "Player" }` after open
3. **Broadcast:** Server sends full state every 2 seconds (throttled/coalesced)
4. **Score sync:** Client sends `{ type: "scoreUpdate", ... }` every 5 seconds
5. **Chat:** Client sends `{ type: "chat", message: "..." }`
6. **Battles:** `challenge`, `acceptChallenge`, `declineChallenge`, `gameMove`
7. **Disconnect:** Server starts 30-second forfeit timer for active games
8. **Reconnect:** Exponential backoff: 1s, 2s, 4s, 8s, max 30s

### Broadcast Payload (sent every 2s)

```json
{
  "type": "update",
  "visitors": 42,
  "online": ["Alice", "Bob"],
  "leaderboard": [{ "name": "Alice", "score": 12345, "stats": {...} }],
  "sabotages": [{ "targetName": "Bob", "attackerName": "Alice", "expiresAt": 1711... }],
  "credits": { "alice": 3, "bob": 1 },
  "campaigns": [{ "id": "camp_...", "targetName": "Charlie", "contributedCents": 500, "totalPriceCents": 1000 }],
  "activeGames": [{ "id": "g_...", "type": "rps", "player1": "Alice", "player2": "Bob" }],
  "groupLobbies": [...],
  "hallOfFame": [...],
  "scoreEpoch": 3,
  "podiumChange": { "position": 1, "newName": "Alice", "oldName": "Bob" }
}
```

---

## 11. Authentication & Security

### Player Auth (per-org, stored in DO)

- **Registration:** Name + PIN (4+ digits) → SHA-256 hash stored in DO
- **Login:** Name + PIN → constant-time comparison → 64-byte random token
- **Client-side hashing:** PIN is SHA-256 hashed via `expo-crypto` before transmission
- **Rate limiting:** 5 failed attempts per username per 15 minutes → `429` response
- **Token management:** Up to 10 tokens per account (multiple devices), FIFO rotation

### Admin Auth (platform-level, JWT)

- **Registration:** Email + password (8+ chars) → SHA-256 hash stored in D1
- **Login:** Email + password → JWT token (HMAC-SHA256, 7-day expiry)
- **JWT claims:** `{ orgId, adminId, email, role, iat, exp }`
- **Roles:** `owner` (can invite admins) and `admin` (can manage org)

### Stripe Webhook Verification

- HMAC-SHA256 signature verification
- 5-minute timestamp tolerance to prevent replay attacks

---

## 12. Internationalization

**File:** `mobile/lib/i18n.js` (450 lines)
**Languages:** en, es, pt, fr, de, ja, ko
**Keys:** 200+

### Design

- Auto-detects device locale via `NativeModules.SettingsManager`
- Falls back to English for missing translations
- Supports interpolation: `t("hello", { name: "World" })` → `"Hello World"`
- Supports plurals: `t("games", { count: 2 })` → `"{count} game{s}"` → `"2 games"`
- All user-facing strings go through `t()` — no hardcoded English in components
- Currency names come from org config (already dynamic)

### Coverage

Full English translations for all screens. Spanish, Portuguese, French, German, Japanese, and Korean have core strings (navigation, auth, game results). Remaining strings fall back to English.

---

## 13. Theme/Vibe System

### 6 Preset Vibes

| Vibe | Primary | Secondary | Accent | Personality |
|------|---------|-----------|--------|-------------|
| Retro Arcade | #FFD700 (gold) | #1a1a2e (dark navy) | #e94560 (rose) | Playful, 8-bit |
| Modern Minimal | #6366f1 (indigo) | #0f172a (slate) | #f59e0b (amber) | Refined |
| Nature & Earth | #d97706 (amber) | #1c1917 (stone) | #65a30d (lime) | Warm |
| Neon Cyber | #06b6d4 (cyan) | #020617 (near-black) | #f43f5e (rose) | Edgy |
| Pastel Pop | #c084fc (violet) | #faf5ff (light) | #fb923c (orange) | Joyful |
| Classic Gold | #ca8a04 (gold) | #0c1222 (deep navy) | #b91c1c (crimson) | Elegant |

### How It Works

1. Org admin picks a vibe during onboarding (step 2)
2. Vibe sets default colors
3. Admin can customize colors (step 3) — overrides vibe defaults
4. Colors stored in D1 `org_config` table
5. Mobile app loads config on org select → `OrgContext.js` builds theme
6. Theme object includes: primary, secondary, accent, surface, text, textMuted, currencyName, coinEmoji, borderRadius
7. All components use `theme.primary`, `theme.currencyName`, etc.

---

## 14. Push Notifications & Live Activities

### Push Notifications (`usePushNotifications.js`)

1. On game join: request permission via `Notifications.requestPermissionsAsync()`
2. Get Expo push token via `Notifications.getExpoPushTokenAsync()`
3. Register token with backend: `POST /orgs/:slug/push/subscribe`
4. Foreground handling: show banners for battles, sabotage (configurable per category)
5. Background tap: navigate to game screen
6. Badge count: cleared when app becomes active

### Live Activities (`useLiveActivity.js` + `FundClickerWidgets.swift`)

Two Live Activity types:

1. **BattleActivity** — shows during active 1v1 battles
   - Lock Screen: player names, scores, game type, wager
   - Dynamic Island compact: ⚔️ + score
   - Dynamic Island expanded: full player scores + wager

2. **FundraiserActivity** — shows fundraiser progress
   - Lock Screen: org name, total raised, player rank
   - Dynamic Island: 💰 + raised amount

Requires custom dev client build (not compatible with Expo Go).

---

## 15. Game Mechanics

### Upgrade System

28 upgrades across 8 tiers, from 15 coins to 1 trillion coins:

| Tier | Cost Range | Example | Effect |
|------|-----------|---------|--------|
| 1: Starter | 15-100 | Deodorant | +1/click |
| 2: Getting Going | 200-500 | Industrial Febreze | +3/sec |
| 3: Mid Game | 750-3K | Gym Membership | +15/click |
| 4: Ramp Up | 5K-25K | Podcast | +50/sec |
| 5: Big Money | 50K-500K | Golden Nose | +100/click |
| 6: Millions | 1M-5M | Orbital Satellite | +2K/sec |
| 7: Tens of Millions | 10M-100M | Quantum Reactor | +1K/click |
| 8: Endgame | 500M-1T | OMEGA | +1M/click, +50M/sec |

Cost formula: `floor(baseCost * scaling^owned)`

### Achievement System

15 achievements tracking clicks, coins, sightings, upgrades, and battles.

### Rank System

27 rank levels from "Newbie" (0 coins) to "ASCENDED" (50 quadrillion coins).

### Photo Events

Every 12-25 clicks, a character photo event triggers:
- Shows character image (from org's `characterPhotos` config) or emoji fallback
- Awards bonus: `floor((coinsPerClick * 10 + coinsPerSecond * 5) * mult) + 50`
- 1.5-second viewing requirement before dismissal
- Increments `sightings` counter

### Offline Earnings

On app load, calculates time since last save:
- 50% of normal auto-income rate
- Capped at 1 hour
- Shows notification with earned amount

---

## 16. Battle System

### 9 Game Types

| Game | Mechanic | Duration | UX Highlight |
|------|----------|----------|--------------|
| Coin Flip | Pure luck (50/50) | 3.5s | Animated coin with rotation |
| Rock Paper Scissors | Strategy | ~10s/round | Hidden moves, reveal animation |
| Clicker Duel | Reflexes | 10s + 3s countdown | Tap button with counter, timer bar |
| Trivia | Knowledge + speed | 30s timeout | Question card, timed answers |
| Tic-Tac-Toe | Strategy | Variable | Board with win line highlight |
| Reaction Race | Reflexes | Variable | Red→Green signal, millisecond timer |
| Connect 4 | Strategy | Variable | 7x6 grid, column drop, win detection |
| Hangman | Knowledge | 60s timeout | Letter keyboard, stick figure, word blanks |
| Battleship | Strategy | Variable | 8x8 dual grids, attack/defense toggle |

### Battle Flow

1. Challenger selects game type + wager (100-10M coins)
2. Challenge sent via WebSocket → target receives modal with haptics + vibration
3. Target accepts → both players' wagers deducted via `scoreCorrection`
4. Game starts → game-specific UI renders in `ActiveGameModal`
5. Moves sent via `{ type: "gameMove", gameId, move }`
6. Server processes moves, broadcasts updates
7. Winner determined → `endGame()` awards pot, sends push notification
8. Forfeit: 30s disconnect → opponent wins automatically

### Group Games (3-20 players)

| Game | Mechanic |
|------|----------|
| Last Click Standing | 10s tap rounds, lowest eliminated |
| Trivia Royale | 5 questions, wrong answer = elimination |
| Auction House | Blind bid, highest bidder wins (or overpays) |

---

## 17. Monetization Features

| Feature | Price | Revenue Path |
|---------|-------|-------------|
| Sabotage Credits | $0.99-3.99 | Halve opponent's click speed for 15 min |
| Coin Cuts | $2-19.99 | Remove 5-40% of target's coins |
| Total Wipe Campaign | $100 (pooled) | Obliterate ALL of a player's progress |
| Break Free | $0.99 | Remove active sabotage immediately |
| Skin Purchase | $5.99-9.99 | Custom coin appearance |
| Double or Nothing | $0.99 | Replay after battle loss |
| Rematch | $1.99 | Best 2 of 3 after loss |

**Revenue split:** 97% to org, 3% platform fee (via Stripe Connect `application_fee_amount`)

---

## 18. Data Persistence & Sync

### Client-Side (AsyncStorage)

| Key | Data | Update Frequency |
|-----|------|-----------------|
| `@fundclicker_org` | Current org info + config | On org select/join |
| `@fundclicker_player_{slug}` | Player name, token | On login/register |
| `@fc_gamestate_{slug}` | Full game state (coins, upgrades, achievements) | Every 10 seconds + on background |

### Server-Side (DO Storage)

| Key | Data |
|-----|------|
| `scores` | All player scores + stats |
| `accounts` | Player accounts with PIN hashes, tokens, gameState |
| `chatMessages` | Last 2,000 chat messages |
| `sabotages` | Active sabotages |
| `credits` | Sabotage credit balances |
| `campaigns` | Coin cut campaigns |
| `skinData` | Owned/equipped skins |
| `scoreEpoch` | Reset counter |
| `hallOfFame` | Weekly snapshots |
| `bannedPlayers` | Active bans |
| `orgConfig` | Org branding |
| `resetSchedule` | Weekly reset config |
| `autobanEnabled` | Autoclicker toggle |

### Cross-Device Sync

1. Player sends `scoreUpdate` with `authToken` + `gameState` every 5 seconds
2. Server stores `gameState` on the account object
3. On login from new device, server returns stored `gameState`
4. Client merges: takes max(local, server) for scores, union for achievements

---

## 19. File Inventory

### Backend (4 files, 2,553 lines)

| File | Lines | Purpose |
|------|-------|---------|
| `worker/src/index.js` | 634 | Multi-tenant edge router |
| `worker/src/org-game.js` | 1,684 | Per-org Durable Object game engine |
| `worker/src/auth.js` | 100 | JWT, password hashing, join codes |
| `worker/src/stripe.js` | 135 | Stripe Connect helpers |

### Database (2 files, 205 lines)

| File | Lines | Purpose |
|------|-------|---------|
| `worker/migrations/0001_initial.sql` | 68 | Core tables (orgs, admins, config, players) |
| `worker/migrations/0002_funds_and_analytics.sql` | 137 | Funds, groups, transactions, analytics, payouts |

### Mobile App (41 files, 8,321 lines JS + 189 lines Swift)

**Lib (7 files):** api.js, gameEngine.js, payments.js, sounds.js, i18n.js, vibes.js, crypto.js
**Context (2 files):** GameContext.js, OrgContext.js
**Hooks (3 files):** useGameState.js, usePushNotifications.js, useLiveActivity.js
**Screens (12 files):** ClickerScreen, LeaderboardScreen, BattleScreen, ShopScreen, ChatScreen, SkinsScreen, ProfileScreen, BanOverlay, CampaignsList, GroupGameLobby, SpectatorView, AdminDashboard
**Games (10 files):** ActiveGameModal + 9 game type UIs
**App (3 files):** _layout.js, index.js, game/[slug].js
**Native (2 files):** live-activity-plugin.js, FundClickerWidgets.swift

### Admin Portal (2 files, 714 lines)

| File | Lines | Purpose |
|------|-------|---------|
| `admin/index.html` | 580 | 5-step onboarding wizard |
| `admin/vibes.js` | 134 | Theme preset definitions |

---

## 20. Deployment & Infrastructure

### Live Deployments

| Service | URL | Platform |
|---------|-----|----------|
| API Worker | `api.fundclicker.com` (`fund-clicker-api.justin-5b6.workers.dev`) | Cloudflare Workers |
| Admin Portal | `admin.fundclicker.com` (`fund-clicker-admin.pages.dev`) | Cloudflare Pages |
| Marketing Site | `fundclicker.com` (`fundclicker-marketing.pages.dev`) | Cloudflare Pages |
| D1 Database | `76f4da22-2614-4227-9531-47c2c7d04bae` | Cloudflare D1 (WNAM) |
| R2 Bucket | `fund-clicker-assets` | Cloudflare R2 |
| Mobile (EAS) | `9f9472c1-f243-48d2-8220-66bc3d8bbd13` | Expo EAS Build |

### Secrets (set via `wrangler secret put`)

- `JWT_SECRET` — HMAC key for admin JWTs
- `STRIPE_SECRET_KEY` — Platform Stripe key (not yet set)
- `STRIPE_WEBHOOK_SECRET` — Webhook signature verification (not yet set)
- `GEMINI_API_KEY` — For AI skin generation (not yet set)

### Deploy Commands

```bash
# Backend
cd fund-clicker/worker
npx wrangler deploy

# Admin portal
cd fund-clicker/admin
npx wrangler pages deploy . --project-name=fund-clicker-admin --commit-dirty=true

# D1 migrations
npx wrangler d1 execute fund-clicker-platform --remote --file=./migrations/0001_initial.sql

# Mobile (requires interactive Apple auth)
cd fund-clicker/mobile
npx eas-cli build --platform ios --profile production
npx eas-cli submit --platform ios --latest
```

### Test Orgs Created

| Org | Slug | Join Code | Created |
|-----|------|-----------|---------|
| Test Church | test-church | HFHASV | 2026-03-22 |
| Grace Community Church | grace-community-church | G9JFTC | 2026-03-22 |
| Lighthouse Chapel | lighthouse-chapel | 6TVD8E | 2026-03-22 |

---

## 21. Key Architectural Decisions

### 1. Durable Objects for Multi-Tenancy (not D1 per-org tables)

**Decision:** Each org gets its own DO instance. Game state lives in DO storage, not D1.

**Why:** DOs provide natural isolation — no risk of data leaks between orgs. Each DO has its own WebSocket connections, in-memory game state, and storage. The game engine code is shared (single class), but instances are isolated. DOs also scale to zero — idle orgs cost nothing.

**Trade-off:** DO storage has no SQL queries. We can't do cross-org analytics from DO storage. That's why D1 exists — for platform-level data (org registry, transactions, analytics).

### 2. Module-Level Singleton for Game State (not React Context)

**Decision:** `useGameState.js` uses a module-level global with listener pattern instead of React Context.

**Why:** Context causes all consumers to re-render on every state change. At 10+ clicks per second, this would re-render every tab 10 times per second. The singleton pattern only notifies subscribed components.

**Trade-off:** Non-standard React pattern. Could be confusing for new developers. But the performance benefit is critical for a clicker game.

### 3. PIN-Based Auth (not OAuth/Magic Links)

**Decision:** Players authenticate with a display name + 4-digit PIN, not email/password or OAuth.

**Why:** The audience is church communities, youth groups, families. Minimal friction is critical. A 4-digit PIN is easy to remember, fast to type, and sufficient for a game (not a bank). The PIN is SHA-256 hashed client-side and server-side.

**Trade-off:** Less secure than email-verified auth. But the attack surface is low — the worst case is someone guessing another player's PIN, which gives them access to a game score (not financial data). Rate limiting (5 attempts/15 min) mitigates brute force.

### 4. Expo Managed Workflow (not bare React Native)

**Decision:** Use Expo's managed workflow with EAS Build.

**Why:** Faster development, OTA updates, no Xcode/Android Studio setup, EAS handles code signing. The `expo-haptics`, `expo-av`, `expo-notifications` modules cover all our needs.

**Trade-off:** Less control over native code. Live Activities require a config plugin (which we've built). If we hit a native limitation, we'd need to eject — but Expo's ecosystem is mature enough that this is unlikely.

### 5. i18n from Day One (not retrofitted)

**Decision:** All user-facing strings go through the `t()` function from the start.

**Why:** Retrofitting i18n is expensive and error-prone. Fund Clicker targets international markets (every country Stripe Connect supports). Building i18n in from the start means adding a new language is just adding translation keys — no code changes.

### 6. Sound Pooling (not create-on-play)

**Decision:** Audio instances are pre-created in a pool and cycled through.

**Why:** Creating a new `Audio.Sound` on every click introduces latency. The pool pre-loads 5 instances of the click sound, cycling through them. This ensures instant playback even at 10+ clicks per second.

### 7. Keep-Alive Tab Rendering (not unmount/remount)

**Decision:** All tabs are rendered simultaneously with `display: "none"` on inactive tabs.

**Why:** Switching tabs preserves component state — scroll position, form inputs, selected game type, etc. Without this, every tab switch loses state and causes a flash of loading.

**Trade-off:** Higher memory usage (6 tab views in memory). Acceptable for modern devices.

---

## 22. Known Limitations & Future Work

### Pre-Launch Requirements

1. **Stripe keys** — Platform `STRIPE_SECRET_KEY` and `STRIPE_CLIENT_ID` need to be set as Worker secrets
2. **Apple Developer account** — needed for EAS Build iOS signing
3. **App Store assets** — icon, screenshots, privacy policy, App Store description
4. **Stripe publishable key** — currently placeholder in `_layout.js`
5. **Sound files** — battle win/lose/sabotage currently reuse achievement/photo sounds. Need dedicated audio.

### Post-Launch Improvements

1. **Custom domains** — `api.fundclicker.com`, `admin.fundclicker.com`
2. **Fund-aware routing** — each fund within an org gets its own DO instance (currently org-level)
3. **Group leaderboard aggregation** — aggregate scores by group within a fund
4. **Admin dashboard web UI** — render the analytics API data with charts (API exists, needs frontend)
5. **Stripe Connect mobile onboarding** — allow admins to connect Stripe from within the mobile app
6. **Custom Gemini skin generation** — AI-generated skins (backend supports it, needs mobile UI)
7. **App Store optimization** — screenshots, video preview, keyword optimization
8. **Performance monitoring** — Sentry or similar for crash reporting
9. **Analytics events** — Mixpanel/Amplitude for product analytics
10. **Deep linking** — `fundclicker://join/HFHASV` to open directly to an org

---

## 23. Security Considerations

| Vector | Mitigation |
|--------|------------|
| Autoclicker bots | Server-side detection (50 CPS threshold, 20-check window), client-side rate limiting (12 CPS), ID rotation |
| PIN brute force | SHA-256 client-side hashing, server-side rate limiting (5/15min), constant-time comparison |
| Score manipulation | Server is authoritative (scoreEpoch), serverCutAt locks, autoclicker detection |
| XSS in chat | Server-side profanity filter, client renders as Text (not HTML) |
| Stripe webhook spoofing | HMAC-SHA256 signature verification, 5-minute timestamp window |
| JWT token theft | 7-day expiry, HMAC-SHA256 signature, per-org scoping |
| DO storage isolation | Each org gets its own DO instance — no shared state |
| API abuse | CORS headers, input validation, slug format validation |
| Admin impersonation | JWT with orgId claim — admin can only access their own org |

---

## 24. Performance Considerations

| Concern | Approach |
|---------|----------|
| Click responsiveness | Client-side state update (immediate), server sync async (5s) |
| WebSocket bandwidth | Broadcasts throttled/coalesced (every 2s), not per-click |
| Chat initial load | Last 200 messages on connect, not full 2,000 |
| FlatList performance | `removeClippedSubviews`, `maxToRenderPerBatch`, `windowSize` |
| Sound latency | Pre-loaded SoundPool with 5 click instances |
| Org lookup speed | In-memory cache with 60s TTL |
| D1 query efficiency | Indexed columns (slug, join_code, email, org_id, date) |
| Tab switching | Keep-alive rendering — no unmount/remount |
| Game state updates | Module-level singleton — no Context re-render cascade |
| Auto-income | Single global setInterval, not per-component |

---

*This document was generated for Codex review prior to TestFlight submission. All systems described are implemented and deployed (backend live, mobile ready for EAS Build).*
