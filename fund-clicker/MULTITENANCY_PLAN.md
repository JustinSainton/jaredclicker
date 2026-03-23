I now have a comprehensive understanding of the entire codebase. Let me compile the full implementation plan.

This is a read-only task, so I cannot write the file to `/Users/justin/Desktop/jaredclicker/fund-clicker/MULTITENANCY_PLAN.md`. Instead, I will provide the complete plan here for you to save.

---

# Fund Clicker: Multi-Tenancy Safety, Moderation & Business Plan

## Complete Implementation Plan for 14 Concerns

**Version:** 1.0.0
**Date:** 2026-03-23
**Status:** Implementation blueprint
**Scope:** All D1 schema, Worker router, Durable Object, mobile app, and admin portal changes

---

## Dependency Graph & Execution Order

```
Phase 1 (Critical - Pre-Launch):
  [13] Rate Limiting ──────────────────┐
  [1]  Join Policies ──────────────────┤
  [4]  Display Name Moderation ────────┤── Foundation
  [3]  Chat Moderation ────────────────┤
  [6]  Org Discovery / Visibility ─────┘

Phase 2 (High - First Month):
  [2]  Child Safety ───────────────────┐
  [5]  Cross-Org Harassment ───────────┤── Trust & Safety
  [8]  Payment Fraud ──────────────────┤
  [9]  AI Content Moderation ──────────┘

Phase 3 (Medium - Scale):
  [14] Cross-Org Analytics ────────────┐
  [7]  Org Creation Limits ────────────┤── Platform Health
  [11] Revenue Reporting ──────────────┤
  [12] Inactive Org Cleanup ───────────┘

Phase 4 (Medium - Compliance):
  [10] Data Privacy / GDPR ────────────── Compliance
```

---

## Migration File: `0003_safety_and_moderation.sql`

All D1 schema changes across the 14 concerns are consolidated into a single migration.

### New Columns on Existing Tables

```sql
-- orgs: visibility + join policy + age mode + creation tracking
ALTER TABLE orgs ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public'
  CHECK (visibility IN ('public', 'unlisted', 'private'));
ALTER TABLE orgs ADD COLUMN join_policy TEXT NOT NULL DEFAULT 'open'
  CHECK (join_policy IN ('open', 'name_required', 'approval_required'));
ALTER TABLE orgs ADD COLUMN under_18_mode INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orgs ADD COLUMN creator_email TEXT DEFAULT NULL;
ALTER TABLE orgs ADD COLUMN last_activity_at TEXT NOT NULL DEFAULT (datetime('now'));
ALTER TABLE orgs ADD COLUMN archived_at TEXT DEFAULT NULL;

-- players: ban status + name tracking
ALTER TABLE players ADD COLUMN platform_banned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN platform_ban_reason TEXT DEFAULT NULL;
ALTER TABLE players ADD COLUMN platform_banned_at TEXT DEFAULT NULL;
ALTER TABLE players ADD COLUMN display_name_updated_at TEXT DEFAULT NULL;
```

### New Tables

```sql
-- Platform-level bans (cross-org, keyed on device_id)
CREATE TABLE IF NOT EXISTS platform_bans (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  device_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  banned_by TEXT DEFAULT NULL,
  org_id TEXT DEFAULT NULL REFERENCES orgs(id),
  expires_at TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(device_id)
);
CREATE INDEX IF NOT EXISTS idx_platform_bans_device ON platform_bans(device_id);

-- Cross-org offense tracking
CREATE TABLE IF NOT EXISTS player_offenses (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  device_id TEXT NOT NULL,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  offense_type TEXT NOT NULL CHECK (offense_type IN (
    'chat_abuse', 'name_abuse', 'autoclicker', 'harassment', 'chargeback', 'other'
  )),
  details TEXT DEFAULT '',
  reported_by TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_offenses_device ON player_offenses(device_id);
CREATE INDEX IF NOT EXISTS idx_offenses_org ON player_offenses(org_id);

-- Chat moderation log
CREATE TABLE IF NOT EXISTS chat_mod_actions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  org_id TEXT NOT NULL REFERENCES orgs(id),
  action_type TEXT NOT NULL CHECK (action_type IN ('delete', 'mute', 'report')),
  target_player TEXT NOT NULL,
  admin_id TEXT DEFAULT NULL,
  message_preview TEXT DEFAULT NULL,
  duration_minutes INTEGER DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_chat_mod_org ON chat_mod_actions(org_id);

-- Player join requests (for approval_required orgs)
CREATE TABLE IF NOT EXISTS join_requests (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT DEFAULT NULL,
  UNIQUE(org_id, device_id)
);
CREATE INDEX IF NOT EXISTS idx_join_requests_org ON join_requests(org_id, status);

-- Stripe dispute tracking
CREATE TABLE IF NOT EXISTS stripe_disputes (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  org_id TEXT NOT NULL REFERENCES orgs(id),
  stripe_dispute_id TEXT UNIQUE NOT NULL,
  stripe_payment_intent_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  reason TEXT DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
    'open', 'won', 'lost', 'closed'
  )),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_disputes_org ON stripe_disputes(org_id);

-- AI content review queue
CREATE TABLE IF NOT EXISTS ai_content_queue (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  org_id TEXT NOT NULL REFERENCES orgs(id),
  content_type TEXT NOT NULL CHECK (content_type IN ('skin', 'coin', 'other')),
  player_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  prompt_used TEXT DEFAULT NULL,
  r2_keys TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'approved', 'rejected', 'auto_approved'
  )),
  reviewed_by TEXT DEFAULT NULL,
  rejection_reason TEXT DEFAULT NULL,
  payment_intent_id TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT DEFAULT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_queue_status ON ai_content_queue(status);
CREATE INDEX IF NOT EXISTS idx_ai_queue_org ON ai_content_queue(org_id);

-- Data deletion requests (GDPR)
CREATE TABLE IF NOT EXISTS data_deletion_requests (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  device_id TEXT NOT NULL,
  email TEXT DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'processing', 'completed', 'failed'
  )),
  requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT DEFAULT NULL,
  deletion_log TEXT DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_deletion_device ON data_deletion_requests(device_id);

-- Email verification tokens (for org creation)
CREATE TABLE IF NOT EXISTS email_verifications (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  email TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'org_creation' CHECK (purpose IN ('org_creation', 'admin_invite')),
  verified_at TEXT DEFAULT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_email_verify_token ON email_verifications(token);
CREATE INDEX IF NOT EXISTS idx_email_verify_email ON email_verifications(email);

-- Org creation rate limiting
CREATE TABLE IF NOT EXISTS org_creation_log (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  email TEXT NOT NULL,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_org_creation_email ON org_creation_log(email);
```

---

## Concern 1: Join Policies

**Priority:** Critical (pre-launch)
**Complexity:** Medium
**Dependencies:** None

### D1 Schema Changes
- `orgs.join_policy` column (added above): `open`, `name_required`, `approval_required`
- `join_requests` table (added above): stores pending approvals

### Worker/Router Changes (`index.js`)

**Modified endpoint: `POST /api/v1/join`**
- After looking up the org by join code, include `join_policy` in the response:
  ```js
  return jsonResponse({
    slug: org.slug, name: org.name, description: org.description,
    joinPolicy: org.join_policy,
    config: config || {},
  });
  ```

**Modified endpoint: `GET /api/v1/orgs/:slug/`**
- Add `joinPolicy: org.join_policy` to the response object.

**New endpoint: `POST /api/v1/orgs/:slug/join-request`**
- Body: `{ deviceId, displayName }`
- Insert into `join_requests` table with status `pending`
- Return `{ id, status: 'pending' }`

**New endpoint: `GET /api/v1/orgs/:slug/admin/join-requests`**
- Requires JWT auth. Returns all pending join requests for the org.

**New endpoint: `POST /api/v1/orgs/:slug/admin/join-request/:id/approve`**
- Updates `join_requests.status` to `approved`, sets `reviewed_at`.

**New endpoint: `POST /api/v1/orgs/:slug/admin/join-request/:id/reject`**
- Updates `join_requests.status` to `rejected`.

**Modified endpoint: `PUT /api/v1/platform/org`**
- Allow updating `join_policy` in the allowed fields list. Validate against the three allowed values.

### DO Changes (`org-game.js`)

**Modified: WebSocket `setIdentity` handler (line ~1469)**
- After authenticating the token, check the org's join policy (stored in orgConfig).
- If `approval_required`, query the router (via a new internal route `/check-join-status`) to verify the player's device_id has an approved join request.
- If not approved, send `{ type: "joinPending", message: "Awaiting admin approval" }` and refuse to set `info.authenticated = true`.

**New orgConfig fields:**
- `joinPolicy` added to `normalizeOrgConfig()`. The router must pass `join_policy` from the orgs table when syncing config to the DO.

### Mobile App Changes

**Modified: `app/game/[slug].js` (AuthGate)**
- After the org info is loaded, check `joinPolicy`.
- If `name_required`: show the normal auth gate (already the case).
- If `approval_required`: after registration, show a "pending approval" screen instead of proceeding to the game. Poll `GET /orgs/:slug/join-request/status?deviceId=X` every 10 seconds. On approval, navigate to the game.
- If `open`: current behavior (no change).

**New component: `components/JoinApprovalPending.js`**
- Waiting screen with animation, "Your request is being reviewed by the admin" message. Localized via i18n.

**Modified: `components/AdminDashboard.js`**
- New section: "Join Requests" with approve/reject buttons. Badge count for pending requests.

### Admin Portal Changes
- Add join policy selector to org settings (Step 3 "Customize" in onboarding or in a settings page).
- Three options with descriptions: Open (anyone can join), Name Required (must register), Approval Required (admin must approve).

---

## Concern 2: Child Safety / Age Considerations

**Priority:** High (first month)
**Complexity:** Large
**Dependencies:** Concern 3 (Chat Moderation)

### D1 Schema Changes
- `orgs.under_18_mode` column (added above): boolean flag.
- No COPPA tables needed at this stage; under-13 users are handled by disabling features entirely rather than collecting parental consent.

### Worker/Router Changes (`index.js`)

**Modified endpoint: `GET /api/v1/orgs/:slug/`**
- Include `under18Mode: !!org.under_18_mode` in response.

**Modified endpoint: `PUT /api/v1/platform/org`**
- Allow updating `under_18_mode` (0 or 1).

**Modified: config sync to DO**
- Pass `under18Mode` as part of orgConfig when syncing.

### DO Changes (`org-game.js`)

**Modified: `normalizeOrgConfig()`**
- Add `under18Mode: !!config.under18Mode || !!config.under_18_mode`.

**Modified: WebSocket `chat` handler (line ~1537)**
- If `this.orgConfig.under18Mode` is true, reject chat messages entirely:
  ```js
  if (this.orgConfig.under18Mode) {
    try { server.send(JSON.stringify({ type: "error", message: "Chat is disabled for this fundraiser" })); } catch {}
    return;
  }
  ```

**Modified: WebSocket `challenge` handler (line ~1554)**
- If under-18 mode, restrict targeted attacks. Specifically:
  - Coin cuts via WebSocket (if any direct mechanism exists) are blocked.
  - Sabotage usage: change to random target selection instead of player-chosen target. The `addSabotage` call should pick a random online player instead of `msg.targetName`.

**Modified: `broadcast()` (line ~486)**
- If under-18 mode, strip chat messages from the broadcast. Only system messages pass through.

**Modified: WebSocket connection init (line ~1441)**
- If under-18 mode, skip sending chat history.

### Mobile App Changes

**Modified: `context/OrgContext.js`**
- Parse `under18Mode` from org info and expose it in the context.

**Modified: Tab navigator in `app/game/[slug].js`**
- If `under18Mode`, hide the Chat tab entirely.
- Modify BattleScreen: hide "Choose target" for sabotage; show "Random target" button instead.
- Hide coin cut target picker; server will randomly select.

**Modified: `components/ShopScreen.js`**
- In under-18 mode, sabotage credits become "random sabotage" (cannot choose target). Coin cut UI shows "Random player" instead of target picker.

### Admin Portal Changes
- New toggle in org settings: "Under-18 Mode (Disables chat, restricts targeted attacks)". Prominent COPPA warning text.

### COPPA Considerations
- Under-13 users: the platform should NOT collect email from players (it already doesn't; email is optional on the `players` table). Device ID is the identifier.
- The `under_18_mode` flag must disable all user-to-user communication features.
- Document in privacy policy that organizations targeting children must enable this mode.
- Consider adding an `age_gate` field that requires a birthdate at registration, blocking under-13 entirely.

---

## Concern 3: Chat Moderation

**Priority:** Critical (pre-launch)
**Complexity:** Medium
**Dependencies:** None

### D1 Schema Changes
- `chat_mod_actions` table (added above).

### Worker/Router Changes (`index.js`)

**New endpoint: `POST /api/v1/orgs/:slug/admin/chat/delete`**
- JWT required. Body: `{ messageTimestamp, playerName }`
- Forwards to DO via internal route `/admin/chat/delete`.
- Records action in `chat_mod_actions`.

**New endpoint: `POST /api/v1/orgs/:slug/admin/chat/mute`**
- JWT required. Body: `{ playerName, durationMinutes }`
- Forwards to DO via internal route `/admin/chat/mute`.
- Records action in `chat_mod_actions`.

### DO Changes (`org-game.js`)

**New DO storage key: `mutedPlayers`**
- Structure: `{ [nameLower]: { until: timestamp, reason: string } }`
- Lazy-loaded like `bannedPlayers`.

**New loader/saver:**
```js
async loadMutedPlayers() {
  if (this.mutedPlayers === null) this.mutedPlayers = (await this.state.storage.get("mutedPlayers")) || {};
  // Clean expired mutes
  const now = Date.now();
  let changed = false;
  for (const key in this.mutedPlayers) {
    if (this.mutedPlayers[key].until <= now) { delete this.mutedPlayers[key]; changed = true; }
  }
  if (changed) await this.state.storage.put("mutedPlayers", this.mutedPlayers);
  return this.mutedPlayers;
}
```

**Modified: WebSocket `chat` handler (line ~1537)**
- Before processing a chat message, check if the player is muted:
  ```js
  const muted = await this.loadMutedPlayers();
  const muteEntry = muted[info.name.toLowerCase()];
  if (muteEntry && muteEntry.until > Date.now()) {
    try { server.send(JSON.stringify({ type: "muted", until: muteEntry.until })); } catch {}
    return;
  }
  ```

**New internal route: `POST /admin/chat/delete`**
- Receives `{ messageTimestamp, playerName }`.
- Removes the matching message from `this.chatMessages` array (match on `timestamp` and `name`).
- Saves chat. Broadcasts `{ type: "chatDeleted", messageTimestamp }` to all connections.

**New internal route: `POST /admin/chat/mute`**
- Receives `{ playerName, durationMinutes }`.
- Adds to `mutedPlayers` with `until = Date.now() + durationMinutes * 60000`.
- Sends `{ type: "muted", until }` to the target player's WebSocket.
- Broadcasts system chat: "Admin muted [playerName] for [X] minutes."

**New chat entry field: `id`**
- Add a unique ID to each chat message for reliable deletion:
  ```js
  const chatEntry = { id: "chat_" + Date.now() + "_" + Math.random().toString(36).slice(2,6), type: "chat", ... };
  ```

### Mobile App Changes

**Modified: `components/ChatScreen.js`**
- Add long-press handler on messages.
- For admins: show "Delete Message" and "Mute Player (5/15/60 min)" options.
- For regular players: show "Report Message" option.
- Handle `chatDeleted` WS message: remove message from local state by matching on timestamp/id.
- Handle `muted` WS message: show a toast "You are muted until [time]". Disable input.

**Modified: `context/GameContext.js`**
- Handle new WS message types: `chatDeleted`, `muted`.
- Expose `isAdmin` flag (from org context) to determine if long-press shows admin options.

**Modified: `components/AdminDashboard.js`**
- New "Muted Players" section showing currently muted players with unmute button.

### Admin Portal Changes
- Chat moderation log viewable in admin dashboard with action history.

---

## Concern 4: Display Name Moderation

**Priority:** Critical (pre-launch)
**Complexity:** Small
**Dependencies:** None

### D1 Schema Changes
- `players.display_name_updated_at` column (added above).

### Worker/Router Changes (`index.js`)
No direct changes; name validation happens in the DO.

### DO Changes (`org-game.js`)

**Modified: `filterProfanity()` function (line ~37)**
- Extract the profanity check into a `containsProfanity(text)` boolean function alongside the existing `filterProfanity(text)` replacement function.
- Make the profanity list more comprehensive. Add common evasion patterns (letter substitution: `@` for `a`, `$` for `s`, `0` for `o`, etc.).

**Modified: Account registration `/account/register` (line ~1142)**
- Before creating the account, run the display name through `containsProfanity(name)`.
- If profane, return `{ error: "That name is not allowed. Please choose a different name." }` with status 400.
- Add basic character validation: alphanumeric + spaces + common punctuation only. Block Unicode trick characters.

**New orgConfig field: `nameApprovalRequired`**
- If true, new registrations go into a `pending_name_approval` state. Player can play but shows as "Player [number]" until approved.

**Name change cooldown:**
- Store `lastNameChangeAt` in the account object within DO storage.
- Allow name changes only once per 24 hours.
- Enforce in a new route: `POST /account/change-name` with body `{ newName, authToken }`.

**Modified: WebSocket `setIdentity` (line ~1469)**
- After authentication, if the account has `nameApprovalPending: true`, send identity but with a flag indicating the name is pending.

### Mobile App Changes

**Modified: AuthGate in `app/game/[slug].js`**
- Show error message inline if name is rejected for profanity.
- If name approval is required by the org, show "Your name is being reviewed" notice.

**New: Name change option in `components/ProfileScreen.js`**
- "Change Display Name" button.
- Disabled if within 24-hour cooldown. Shows countdown timer.
- New name goes through profanity filter.

### Admin Portal Changes
- If `nameApprovalRequired` is enabled in org settings, admin dashboard shows a list of names pending approval.

---

## Concern 5: Cross-Org Harassment

**Priority:** High (first month)
**Complexity:** Large
**Dependencies:** Concern 3 (Chat Moderation), Concern 4 (Name Moderation)

### D1 Schema Changes
- `platform_bans` table (added above).
- `player_offenses` table (added above).
- `players.platform_banned` column (added above).

### Worker/Router Changes (`index.js`)

**New middleware: `checkPlatformBan(env, deviceId)`**
- Called before forwarding any request to a DO.
- Queries `platform_bans` by device_id. If an active ban exists (no expiry or `expires_at > now`), return 403 with ban reason.

**Modified: `handleOrgRoutes()` (line ~587)**
- Before the WebSocket upgrade and account registration, extract `device_id` from the request (sent as a query parameter on the WebSocket URL or in the request body).
- Call `checkPlatformBan()`. If banned, reject.

**New platform admin endpoints:**
- `POST /api/v1/platform/admin/ban-device` - Body: `{ deviceId, reason, expiresAt? }`
- `POST /api/v1/platform/admin/unban-device` - Body: `{ deviceId }`
- `GET /api/v1/platform/admin/offenses?deviceId=X` - Returns offense history.
- `POST /api/v1/platform/admin/record-offense` - Body: `{ deviceId, orgId, offenseType, details }`

**Auto-escalation logic (in a helper function):**
- When recording an offense, count total offenses for the device_id.
- 3 offenses across different orgs within 30 days: auto-apply platform ban (7 days).
- 5 offenses: permanent platform ban.
- This runs in the offense recording endpoint.

### DO Changes (`org-game.js`)

**Modified: WebSocket upgrade (line ~1430)**
- Accept a `deviceId` parameter from the connection URL.
- Store it in the connection info: `info.deviceId = url.searchParams.get('deviceId')`.

**Modified: Admin ban endpoint `/admin/unban` (line ~1083)**
- When an org admin bans a player, also call the router to record an offense via internal route.

**New internal route: `/report-offense`**
- Called by the router. Records the offense in D1 `player_offenses` table.

### Mobile App Changes

**Modified: WebSocket URL construction in `context/GameContext.js`**
- Append `?deviceId=XXXXX` to the WebSocket URL so the server can check platform bans.

**New: "Report Player" option on leaderboard long-press**
- Sends a report to the org admin (stored in DO, visible in admin dashboard).

### Admin Portal Changes
- Platform superadmin dashboard: view all platform bans, offenses by device, ban/unban controls.
- Org admin dashboard: "Report to Platform" button on banned players.

---

## Concern 6: Org Discovery / Visibility

**Priority:** Critical (pre-launch)
**Complexity:** Small
**Dependencies:** None

### D1 Schema Changes
- `orgs.visibility` column (added above): `public`, `unlisted`, `private`.

### Worker/Router Changes (`index.js`)

**Modified: `GET /api/v1/search` (line ~571)**
- Add `AND visibility = 'public'` to the search query:
  ```sql
  SELECT slug, name, description FROM orgs
  WHERE status = 'active' AND visibility = 'public'
  AND (name LIKE ? OR slug LIKE ?) LIMIT 20
  ```

**Modified: `POST /api/v1/join` (line ~556)**
- `unlisted` and `public` orgs are joinable via join code (no change needed).
- `private` orgs: reject join code lookup with `{ error: "This fundraiser is invite-only" }`.
- For private orgs, joining only works through admin-generated invite links.

**New endpoint: `POST /api/v1/orgs/:slug/invite-link`**
- Admin-only. Generates a single-use or time-limited invite URL.
- Stores in a new `org_invite_links` table (or reuses `org_invitations` with a player-specific flow).

**Modified: `GET /api/v1/orgs/:slug/` (line ~601)**
- Include `visibility: org.visibility` in response.

**Modified: `PUT /api/v1/platform/org` (line ~897)**
- Allow updating `visibility` field. Validate against the three options.

### Mobile App Changes

**Modified: `app/index.js` (org selection screen)**
- Search results only show public orgs (server already filters).
- Join code entry works for public and unlisted orgs.
- For private orgs, add "Enter invite link" flow.

### Admin Portal Changes
- Visibility selector in org settings: Public (appears in search), Unlisted (join code only), Private (invite links only).
- For private orgs: "Generate Invite Link" button that creates a shareable URL.

---

## Concern 7: Org Creation Limits / Abuse

**Priority:** Medium (scale)
**Complexity:** Medium
**Dependencies:** Concern 6 (Visibility)

### D1 Schema Changes
- `email_verifications` table (added above).
- `org_creation_log` table (added above).
- `orgs.creator_email` column (added above).

### Worker/Router Changes (`index.js`)

**Modified: `POST /api/v1/platform/register` (line ~744)**

Before creating the org, add these checks:

1. **Rate limit check:**
   ```js
   const recentOrgs = await env.DB.prepare(
     "SELECT COUNT(*) as cnt FROM org_creation_log WHERE lower(email) = lower(?) AND created_at > datetime('now', '-30 days')"
   ).bind(normalizedEmail).first();
   if (recentOrgs.cnt >= 3) {
     return errorResponse("Maximum 3 organizations per email per month", 429);
   }
   ```

2. **Email verification check:**
   ```js
   const verified = await env.DB.prepare(
     "SELECT id FROM email_verifications WHERE lower(email) = lower(?) AND purpose = 'org_creation' AND verified_at IS NOT NULL AND created_at > datetime('now', '-24 hours')"
   ).bind(normalizedEmail).first();
   if (!verified) {
     return errorResponse("Email must be verified first. Call POST /platform/verify-email", 403);
   }
   ```

3. **After successful creation, log it:**
   ```js
   await env.DB.prepare("INSERT INTO org_creation_log (email, org_id) VALUES (?, ?)").bind(normalizedEmail, orgId).run();
   ```

4. **Set `creator_email` on the org:**
   ```js
   // Add creator_email to the org INSERT
   ```

**New endpoint: `POST /api/v1/platform/verify-email`**
- Body: `{ email }`
- Generates a 6-digit code, stores in `email_verifications` with 15-minute expiry.
- Sends verification email via a transactional email service (Resend, SendGrid, or Mailgun via fetch).

**New endpoint: `POST /api/v1/platform/verify-email/confirm`**
- Body: `{ email, code }`
- Validates the code, sets `verified_at`.

### Mobile App Changes
- None directly (admin portal handles org creation).

### Admin Portal Changes
- Add email verification step before Step 1 of onboarding.
- Show verification code input.
- Display "3 orgs remaining this month" counter.

---

## Concern 8: Payment Fraud

**Priority:** High (first month)
**Complexity:** Large
**Dependencies:** None

### D1 Schema Changes
- `stripe_disputes` table (added above).
- Add to `transactions` table (new column):
  ```sql
  ALTER TABLE transactions ADD COLUMN dispute_status TEXT DEFAULT NULL
    CHECK (dispute_status IN (NULL, 'open', 'won', 'lost'));
  ```

### Worker/Router Changes (`index.js`)

**Modified: Stripe webhook handler (line ~1168)**

Add handling for dispute events:

```js
if (event.type === "charge.dispute.created") {
  const dispute = event.data.object;
  const paymentIntentId = dispute.payment_intent;

  // Look up the transaction
  const txn = await env.DB.prepare(
    "SELECT org_id FROM transactions WHERE stripe_payment_intent_id = ?"
  ).bind(paymentIntentId).first();

  if (txn) {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO stripe_disputes (org_id, stripe_dispute_id, stripe_payment_intent_id, amount_cents, reason, status) VALUES (?, ?, ?, ?, ?, 'open')"
      ).bind(txn.org_id, dispute.id, paymentIntentId, dispute.amount, dispute.reason),
      env.DB.prepare(
        "UPDATE transactions SET dispute_status = 'open' WHERE stripe_payment_intent_id = ?"
      ).bind(paymentIntentId),
    ]);

    // Check chargeback rate
    await checkChargebackRate(env, txn.org_id);
  }
  return jsonResponse({ received: true });
}

if (event.type === "charge.dispute.closed") {
  const dispute = event.data.object;
  const status = dispute.status === "won" ? "won" : "lost";
  await env.DB.prepare(
    "UPDATE stripe_disputes SET status = ?, updated_at = datetime('now') WHERE stripe_dispute_id = ?"
  ).bind(status, dispute.id).run();
  await env.DB.prepare(
    "UPDATE transactions SET dispute_status = ? WHERE stripe_payment_intent_id = ?"
  ).bind(status, dispute.payment_intent).run();
  return jsonResponse({ received: true });
}
```

**New helper: `checkChargebackRate(env, orgId)`**
```js
async function checkChargebackRate(env, orgId) {
  const stats = await env.DB.prepare(`
    SELECT
      COUNT(*) as total_txns,
      SUM(CASE WHEN dispute_status IS NOT NULL THEN 1 ELSE 0 END) as disputed_txns
    FROM transactions
    WHERE org_id = ? AND created_at > datetime('now', '-90 days')
  `).bind(orgId).first();

  const rate = stats.total_txns > 0 ? stats.disputed_txns / stats.total_txns : 0;

  // Stripe threshold is 0.75%. Auto-suspend at 0.5% to give buffer.
  if (rate > 0.005 && stats.total_txns >= 20) {
    await env.DB.prepare(
      "UPDATE orgs SET status = 'suspended', updated_at = datetime('now') WHERE id = ?"
    ).bind(orgId).run();
    // Invalidate cache
    const org = await env.DB.prepare("SELECT slug FROM orgs WHERE id = ?").bind(orgId).first();
    if (org) orgCache.delete(org.slug);
    // TODO: Send notification email to org admin
  }
}
```

**New platform admin endpoint: `GET /api/v1/platform/admin/disputes`**
- Returns all open disputes with org info. For the platform ops dashboard.

**New platform admin endpoint: `POST /api/v1/platform/admin/orgs/:orgId/unsuspend`**
- Re-activates a suspended org after review.

### DO Changes (`org-game.js`)
No changes needed; payment fraud is handled entirely at the D1/router layer.

### Mobile App Changes
- No player-facing changes.
- Suspended orgs will return 404 on lookup (existing behavior when `status != 'active'`).

### Admin Portal Changes
- Dashboard: show chargeback rate as a metric.
- If org is suspended, show a banner with reason and contact instructions.
- Platform admin dashboard: dispute list, suspend/unsuspend controls, chargeback rate by org.

---

## Concern 9: AI Content Moderation

**Priority:** High (first month)
**Complexity:** Medium
**Dependencies:** None

### D1 Schema Changes
- `ai_content_queue` table (added above).

### Worker/Router Changes (`index.js`)

**Modified: `applyPaymentEntitlement()` for `custom_skin` and `custom_coin` (line ~307)**
- Instead of immediately saving the custom skin to the DO, insert into the `ai_content_queue` with status `pending`:
  ```js
  case "custom_skin":
    await env.DB.prepare(
      "INSERT INTO ai_content_queue (org_id, content_type, player_name, description, payment_intent_id, status) VALUES (?, 'skin', ?, ?, ?, 'pending')"
    ).bind(org.id, metadata.playerName, metadata.description, paymentIntentId).run();
    // Still save payment reference in DO for tracking
    await callInternalOrgRoute(env, orgId, "/skins/save-custom", {
      body: { paymentIntentId, playerName: metadata.playerName, description: metadata.description, status: "pending_review" },
    });
    return;
  ```

**New endpoint: `GET /api/v1/platform/admin/ai-queue`**
- Platform admin only. Returns pending AI content for review.

**New endpoint: `POST /api/v1/platform/admin/ai-queue/:id/approve`**
- Triggers the Gemini generation, stores assets in R2.
- Updates queue status to `approved`. Notifies the DO to make the skin available.

**New endpoint: `POST /api/v1/platform/admin/ai-queue/:id/reject`**
- Updates queue status to `rejected`.
- Triggers a refund via Stripe API.
- Body: `{ reason }`.

**Gemini safety filters:**
- Before sending any prompt to Gemini, prepend safety instructions:
  ```
  SAFETY: Do not generate content that is violent, sexual, hateful, or depicts real people without consent. The output is for a family-friendly fundraising game.
  ```
- Parse Gemini's safety ratings from the response. If any category is flagged `HARM_PROBABILITY_HIGH`, auto-reject and queue for manual review.

**Auto-approval path:**
- If Gemini safety ratings are all `NEGLIGIBLE` and the description passes profanity filter, auto-approve with status `auto_approved`.
- This allows fast delivery while flagging edge cases.

### DO Changes (`org-game.js`)

**Modified: `/skins/save-custom` handler**
- Accept a `status` field. If `pending_review`, store it but do not add to `owned` array yet.
- New internal route: `/skins/finalize-custom` - called after admin approval to move skin to `owned`.

### Mobile App Changes
- After purchasing a custom skin, show "Your custom skin is being reviewed and will be ready soon" instead of immediately showing it.
- Handle a new WS message `customSkinReady` that triggers a notification when the skin is approved.

### Admin Portal Changes
- AI content review queue page with preview, approve/reject buttons, and rejection reason input.

---

## Concern 10: Data Privacy / GDPR

**Priority:** Medium (compliance)
**Complexity:** Large
**Dependencies:** Concern 5 (Cross-Org, for device_id tracking)

### D1 Schema Changes
- `data_deletion_requests` table (added above).

### Worker/Router Changes (`index.js`)

**New endpoint: `POST /api/v1/platform/privacy/delete-request`**
- Body: `{ deviceId, email? }`
- Creates a `data_deletion_requests` entry with status `pending`.
- Returns `{ requestId, estimatedCompletion: "72 hours" }`.

**New endpoint: `GET /api/v1/platform/privacy/delete-request/:id`**
- Returns the status of a deletion request.

**New endpoint: `POST /api/v1/platform/privacy/export`**
- Body: `{ deviceId }`
- Queries all player data across D1 tables:
  - `players` row
  - `player_orgs` memberships
  - `player_groups` memberships
  - `transactions` where player_name matches
  - `chat_mod_actions` where target_player matches
- Returns a JSON bundle.

**New scheduled handler or admin endpoint: `POST /api/v1/platform/admin/process-deletion/:id`**
- Executes the actual deletion:
  1. Delete from `players` (cascades to `player_orgs`, `player_groups`).
  2. Anonymize `transactions` (set `player_name` to `[deleted]`, clear metadata personal fields).
  3. Anonymize `chat_mod_actions`.
  4. Delete from `platform_bans` and `player_offenses` for the device_id.
  5. For each org the player belonged to, call the DO's internal route `/admin/delete-player-data` to remove the player from DO storage (accounts, scores, chat messages authored by them, skin data, push subscriptions, credits).
  6. Update `data_deletion_requests` status to `completed`.
  7. Delete R2 assets if any were player-specific.

### DO Changes (`org-game.js`)

**New internal route: `/admin/delete-player-data`**
- Body: `{ playerName }`
- Removes the player from:
  - `accounts` (delete the key)
  - `persistedScores` (delete the key)
  - `credits` (delete the key)
  - `chatMessages` (anonymize to `[deleted user]`)
  - `skinData.owned`, `skinData.equipped` (delete the key)
  - `pushSubscriptions` (delete the key)
  - `bannedPlayers` (delete the key)
- Save all modified storage.

### Mobile App Changes

**New: `components/ProfileScreen.js` additions**
- "Request Data Export" button - calls export endpoint, shows JSON or offers download.
- "Delete My Data" button - confirms via Alert, calls deletion endpoint, shows confirmation.
- Privacy policy link.

### Admin Portal Changes
- Privacy settings page with links to privacy policy.
- Platform admin: deletion request queue, process/view status.

---

## Concern 11: Revenue Reporting

**Priority:** Medium (scale)
**Complexity:** Medium
**Dependencies:** None

### D1 Schema Changes
No new tables needed. The existing `transactions` and `daily_stats` tables contain all the data.

### Worker/Router Changes (`index.js`)

**New endpoint: `GET /api/v1/platform/reports/transactions`**
- JWT required. Query params: `startDate`, `endDate`, `fundId?`, `format=json|csv`.
- Queries:
  ```sql
  SELECT * FROM transactions
  WHERE org_id = ? AND created_at BETWEEN ? AND ?
  ORDER BY created_at DESC
  ```
- If format is `csv`, return with `Content-Type: text/csv` and `Content-Disposition: attachment; filename=transactions-2026-01-01-to-2026-03-23.csv`.

**New endpoint: `GET /api/v1/platform/reports/summary`**
- JWT required. Query params: `year`.
- Returns annual summary:
  ```json
  {
    "year": 2026,
    "totalGrossRevenue": 15000,
    "totalPlatformFees": 450,
    "totalStripeFees": 725,
    "totalNetRevenue": 13825,
    "transactionCount": 342,
    "monthlyBreakdown": [...]
  }
  ```
- Query:
  ```sql
  SELECT
    strftime('%Y-%m', created_at) as month,
    COUNT(*) as count,
    SUM(amount_cents) as gross,
    SUM(platform_fee_cents) as platform_fees,
    SUM(stripe_fee_cents) as stripe_fees,
    SUM(net_cents) as net
  FROM transactions
  WHERE org_id = ? AND strftime('%Y', created_at) = ? AND status = 'succeeded'
  GROUP BY month ORDER BY month
  ```

**New endpoint: `GET /api/v1/platform/reports/daily`**
- JWT required. Returns data from `daily_stats` for the org.

**New endpoint: `GET /api/v1/platform/reports/tax-summary`**
- Returns a simplified annual statement suitable for tax reporting:
  - Total received
  - Total fees
  - Net disbursed
  - Number of transactions
  - Stripe account ID for reference

### Mobile App Changes
- No player-facing changes.

### Admin Portal Changes
- New "Reports" page accessible from admin dashboard.
- Date range picker with preset options (This Month, Last Month, This Year, Custom).
- Export buttons for CSV and PDF.
- Annual summary card with key metrics.

---

## Concern 12: Inactive Org Cleanup

**Priority:** Medium (scale)
**Complexity:** Small
**Dependencies:** Concern 14 (Cross-Org Analytics for activity tracking)

### D1 Schema Changes
- `orgs.last_activity_at` column (added above).
- `orgs.archived_at` column (added above).

### Worker/Router Changes (`index.js`)

**Modified: `handleOrgRoutes()` (line ~587)**
- On every request to an org route, update `last_activity_at`:
  ```js
  // Fire and forget (non-blocking)
  ctx.waitUntil(
    env.DB.prepare("UPDATE orgs SET last_activity_at = datetime('now') WHERE id = ?").bind(org.id).run()
  );
  ```
  Throttle this to once per hour using the org cache:
  ```js
  if (!orgCache.get(slug)?.lastActivityUpdate || Date.now() - orgCache.get(slug).lastActivityUpdate > 3600000) {
    ctx.waitUntil(env.DB.prepare("UPDATE orgs SET last_activity_at = datetime('now') WHERE id = ?").bind(org.id).run());
    orgCache.get(slug).lastActivityUpdate = Date.now();
  }
  ```

**New scheduled handler (cron trigger in wrangler.toml):**
Add to wrangler.toml:
```toml
[triggers]
crons = ["0 3 * * *"]  # Daily at 3 AM UTC
```

Add to `index.js`:
```js
async scheduled(event, env, ctx) {
  // Auto-archive orgs inactive for 12 months
  await env.DB.prepare(`
    UPDATE orgs SET status = 'suspended', archived_at = datetime('now')
    WHERE status = 'active'
    AND last_activity_at < datetime('now', '-12 months')
    AND id NOT IN (SELECT org_id FROM transactions WHERE created_at > datetime('now', '-12 months'))
  `).run();

  // Also run cross-org analytics rollup (Concern 14)
  await rollUpDailyStats(env);

  // Process pending data deletion requests (Concern 10)
  // ...
}
```

**New endpoint: `POST /api/v1/platform/admin/orgs/:orgId/reactivate`**
- Platform admin only. Sets status back to `active`, clears `archived_at`.

### DO Changes (`org-game.js`)
No changes. Archived orgs simply won't be routed to (the `lookupOrg` query filters by `status = 'active'`).

### Mobile App Changes
- When a player tries to join an archived org, they get "This fundraiser is no longer active."

### Admin Portal Changes
- Archived orgs show a "Reactivate" button.
- 30-day warning email before archival (requires email sending capability).

---

## Concern 13: Rate Limiting

**Priority:** Critical (pre-launch)
**Complexity:** Medium
**Dependencies:** None

### D1 Schema Changes
None needed. Rate limiting uses in-memory state in the Worker and DO.

### Worker/Router Changes (`index.js`)

**New: IP-based rate limiter (in-memory, per Worker isolate)**

```js
const ipRateLimiter = new Map();
const IP_RATE_LIMIT = 100;      // requests per window
const IP_RATE_WINDOW = 60_000;  // 1 minute

function checkIPRateLimit(request) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const now = Date.now();
  let entry = ipRateLimiter.get(ip);

  if (!entry || now - entry.windowStart > IP_RATE_WINDOW) {
    entry = { windowStart: now, count: 0 };
    ipRateLimiter.set(ip, entry);
  }

  entry.count++;

  // Periodic cleanup (every 1000 checks)
  if (ipRateLimiter.size > 10000) {
    for (const [key, val] of ipRateLimiter) {
      if (now - val.windowStart > IP_RATE_WINDOW) ipRateLimiter.delete(key);
    }
  }

  if (entry.count > IP_RATE_LIMIT) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
      status: 429,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Retry-After": String(Math.ceil((entry.windowStart + IP_RATE_WINDOW - now) / 1000)),
      },
    });
  }
  return null;
}
```

**Modified: Main `fetch()` handler (line ~525)**
- Add rate limit check at the top:
  ```js
  const rateLimited = checkIPRateLimit(request);
  if (rateLimited) return rateLimited;
  ```

### DO Changes (`org-game.js`)

**WebSocket connection cap per org:**
```js
// In the WebSocket upgrade section (line ~1430):
const MAX_CONNECTIONS_PER_ORG = 500;
if (this.connections.size >= MAX_CONNECTIONS_PER_ORG) {
  return new Response("Too many connections", { status: 503 });
}
```

**Score update throttling:**
- Already partially implemented via `scheduleBroadcast()` (2-second throttle on line 142).
- Add per-player score update throttling:
  ```js
  // In the scoreUpdate handler (line ~1489):
  if (!this._lastScoreUpdate) this._lastScoreUpdate = {};
  const lastUpdate = this._lastScoreUpdate[info.name?.toLowerCase()];
  if (lastUpdate && Date.now() - lastUpdate < 3000) return; // Max 1 update per 3 seconds
  this._lastScoreUpdate[info.name?.toLowerCase()] = Date.now();
  ```

**Chat rate limiting:**
- In the chat handler (line ~1537), add per-player rate limiting:
  ```js
  if (!this._chatRateLimit) this._chatRateLimit = {};
  const chatKey = info.name.toLowerCase();
  const chatRL = this._chatRateLimit[chatKey];
  const now = Date.now();
  if (chatRL) {
    chatRL.messages = chatRL.messages.filter(t => now - t < 60000);
    if (chatRL.messages.length >= 20) { // Max 20 messages per minute
      try { server.send(JSON.stringify({ type: "error", message: "Slow down! Max 20 messages per minute." })); } catch {}
      return;
    }
    chatRL.messages.push(now);
  } else {
    this._chatRateLimit[chatKey] = { messages: [now] };
  }
  ```

**WebSocket message rate limiting (DDoS protection):**
```js
// At the top of the message handler (line ~1454):
if (!info._msgCount) info._msgCount = { count: 0, windowStart: Date.now() };
const msgRL = info._msgCount;
const now = Date.now();
if (now - msgRL.windowStart > 10000) { msgRL.count = 0; msgRL.windowStart = now; }
msgRL.count++;
if (msgRL.count > 100) { // Max 100 WS messages per 10 seconds
  try { server.send(JSON.stringify({ type: "error", message: "Rate limited" })); } catch {}
  return;
}
```

### Mobile App Changes
- Handle 429 responses gracefully in `lib/api.js`: show a "Please wait..." message instead of an error.
- Handle `{ type: "error", message: "Rate limited" }` WS messages.

### Admin Portal Changes
- No changes needed.

---

## Concern 14: Cross-Org Analytics

**Priority:** Medium (scale)
**Complexity:** Medium
**Dependencies:** Concern 12 (Inactive Org Cleanup - shared cron)

### D1 Schema Changes
No new tables needed. The existing `daily_stats` table has the right schema. We need to populate it from DO data.

### Worker/Router Changes (`index.js`)

**New internal route called during cron: `rollUpDailyStats(env)`**

```js
async function rollUpDailyStats(env) {
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  // Get all active orgs
  const orgs = await env.DB.prepare(
    "SELECT id FROM orgs WHERE status = 'active'"
  ).all();

  for (const org of orgs.results) {
    try {
      // Fetch stats from the DO
      const stats = await callInternalOrgRoute(env, org.id, "/stats/daily", {
        method: "POST",
        body: { date: yesterday },
      });

      if (stats && stats.activePlayerCount > 0) {
        await env.DB.prepare(`
          INSERT INTO daily_stats (org_id, fund_id, date, active_players, new_players, total_clicks, total_coins_earned, battles_played, sabotages_used, chat_messages, peak_concurrent)
          VALUES (?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(org_id, fund_id, date) DO UPDATE SET
            active_players = excluded.active_players,
            total_clicks = excluded.total_clicks,
            total_coins_earned = excluded.total_coins_earned,
            battles_played = excluded.battles_played,
            sabotages_used = excluded.sabotages_used,
            chat_messages = excluded.chat_messages,
            peak_concurrent = excluded.peak_concurrent
        `).bind(
          org.id, yesterday,
          stats.activePlayerCount || 0,
          stats.newPlayerCount || 0,
          stats.totalClicks || 0,
          stats.totalCoinsEarned || 0,
          stats.battlesPlayed || 0,
          stats.sabotagesUsed || 0,
          stats.chatMessages || 0,
          stats.peakConcurrent || 0,
        ).run();
      }
    } catch (e) {
      // Log but don't fail the entire rollup
      console.error(`Stats rollup failed for org ${org.id}:`, e.message);
    }
  }
}
```

**Modified: `scheduled()` handler (shared with Concern 12)**
- Call `rollUpDailyStats(env)` as part of the daily cron.

**Modified: `GET /api/v1/platform/dashboard` endpoint**
- Already exists. Ensure it queries `daily_stats` for the chart data:
  ```sql
  SELECT date, active_players, gross_revenue_cents, total_clicks
  FROM daily_stats
  WHERE org_id = ? AND date > datetime('now', '-30 days')
  ORDER BY date
  ```

**New endpoint: `GET /api/v1/platform/platform-stats`**
- Platform-level aggregate stats for superadmin:
  ```sql
  SELECT
    COUNT(DISTINCT org_id) as active_orgs,
    SUM(active_players) as total_active_players,
    SUM(gross_revenue_cents) as total_gross_revenue,
    SUM(platform_fee_cents) as total_platform_fees
  FROM daily_stats
  WHERE date > datetime('now', '-30 days')
  ```

### DO Changes (`org-game.js`)

**New DO storage keys for daily stats tracking:**
- `dailyStats_YYYY-MM-DD`: `{ activePlayerCount, totalClicks, chatMessages, battlesPlayed, sabotagesUsed, peakConcurrent }`

**Modified: Various handlers to increment daily counters**

Add a helper:
```js
async incrementDailyStat(field, amount = 1) {
  const today = new Date().toISOString().slice(0, 10);
  const key = "dailyStats_" + today;
  const stats = (await this.state.storage.get(key)) || {};
  stats[field] = (stats[field] || 0) + amount;
  await this.state.storage.put(key, stats);
}
```

Increment points:
- `scoreUpdate` handler: `incrementDailyStat("totalClicks", msg.totalClicks - previousClicks)`.
- `chat` handler: `incrementDailyStat("chatMessages")`.
- Battle start: `incrementDailyStat("battlesPlayed")`.
- Sabotage use: `incrementDailyStat("sabotagesUsed")`.
- WebSocket connect: track peak concurrent via `Math.max(stats.peakConcurrent, this.connections.size)`.

**New internal route: `POST /stats/daily`**
- Body: `{ date }`
- Returns the stored daily stats for the given date.
- Also returns unique player count from the accounts map.

**Track active players:**
- On each `setIdentity` or `scoreUpdate`, add the player name to a daily set:
  ```js
  async trackActivePlayer(name) {
    const today = new Date().toISOString().slice(0, 10);
    const key = "activePlayers_" + today;
    const set = (await this.state.storage.get(key)) || {};
    if (!set[name.toLowerCase()]) {
      set[name.toLowerCase()] = true;
      await this.state.storage.put(key, set);
    }
  }
  ```

### Mobile App Changes
- No player-facing changes.

### Admin Portal Changes
- Enhanced dashboard with charts: daily active players, revenue trends, click volume.
- Platform superadmin: cross-org leaderboard (top orgs by revenue, players, engagement).

---

## Wrangler.toml Changes Summary

```toml
# Add cron trigger for daily rollups + cleanup
[triggers]
crons = ["0 3 * * *"]

# Add new secrets needed:
# RESEND_API_KEY (for email verification, Concern 7)
# Set via: wrangler secret put RESEND_API_KEY
```

---

## i18n Keys Required (New)

Add to `/Users/justin/Desktop/jaredclicker/fund-clicker/mobile/lib/i18n.js`:

```
joinPending, joinApproved, joinRejected, awaitingApproval,
chatDisabled, underageMode, reportMessage, deleteMessage,
mutePlayer, muteMinutes, mutedUntil, nameNotAllowed,
nameChangeTitle, nameChangeCooldown, reportPlayer,
platformBanned, platformBanReason, privacyPolicy,
requestDataExport, deleteMyData, deleteDataConfirm,
rateLimit, slowDown, inviteOnly, fundraiserArchived,
customSkinPendingReview, customSkinReady, customSkinRejected,
chargebackWarning, orgSuspended
```

---

## Estimated Implementation Timeline

| Phase | Concerns | Engineer-Days | Calendar Weeks |
|-------|----------|---------------|----------------|
| Phase 1 (Critical) | 13, 1, 4, 3, 6 | 12-15 | 2-3 |
| Phase 2 (High) | 2, 5, 8, 9 | 15-20 | 3-4 |
| Phase 3 (Medium) | 14, 7, 11, 12 | 10-12 | 2-3 |
| Phase 4 (Compliance) | 10 | 8-10 | 2 |
| **Total** | **14 concerns** | **45-57** | **9-12** |

---

## Risk Mitigation Notes

1. **DO storage limits:** Durable Object storage has a 128KB per-key limit. The `chatMessages` array (2000 messages) is already close. Chat moderation (deleting messages) helps keep size down. Consider archiving old messages to R2 if any org exceeds the limit.

2. **Cron handler timeout:** Cloudflare Workers cron triggers have a 30-second timeout (free) or 15-minute timeout (paid). The `rollUpDailyStats` function iterating all orgs could exceed this. Use `ctx.waitUntil()` and batch in groups of 50. Consider using Queues for large-scale rollup.

3. **Platform bans vs. device ID spoofing:** Device IDs can be reset by reinstalling the app. Consider adding additional fingerprinting (IP patterns, behavioral analysis) in a future iteration. For now, device_id provides a reasonable baseline.

4. **GDPR deletion from DOs:** Deleting player data from DOs requires making internal HTTP calls to each DO the player participated in. This is slow for players who joined many orgs. Process deletions asynchronously with status tracking.

5. **Email sending:** Concerns 7 and 12 require sending emails (verification codes, archival warnings). The recommended approach is Resend.com (free tier: 100 emails/day, $20/mo for 50k). Single `fetch()` call from the Worker.

---

### Critical Files for Implementation

- `/Users/justin/Desktop/jaredclicker/fund-clicker/worker/src/index.js` - Main router: add all new endpoints (join requests, platform bans, rate limiting, privacy, reports, disputes), modify org lookup with visibility filter, add IP rate limiter, add scheduled handler for cron
- `/Users/justin/Desktop/jaredclicker/fund-clicker/worker/src/org-game.js` - Durable Object: add muted players, chat moderation routes, daily stats tracking, player data deletion, connection caps, per-player rate limits, under-18 mode enforcement, name profanity filter on registration
- `/Users/justin/Desktop/jaredclicker/fund-clicker/worker/migrations/0003_safety_and_moderation.sql` - New migration file: all 10 new tables and 6 new columns defined in this plan
- `/Users/justin/Desktop/jaredclicker/fund-clicker/mobile/components/AdminDashboard.js` - Admin dashboard: add chat moderation controls (delete/mute), join request approval queue, muted players list, name approval queue, chargeback rate display
- `/Users/justin/Desktop/jaredclicker/fund-clicker/mobile/context/GameContext.js` - Game context: handle new WS message types (chatDeleted, muted, joinPending, customSkinReady, platformBanned), pass deviceId on WebSocket URL, handle 429 responses