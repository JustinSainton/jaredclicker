-- Fund Clicker: Expanded multi-fund + analytics schema
-- Supports: multiple fundraisers per org, group competitions,
-- platform analytics, payout configuration, and admin dashboards.

-- Funds: individual fundraisers within an org
-- An org can run multiple funds simultaneously (e.g., youth group vs worship team)
CREATE TABLE IF NOT EXISTS funds (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT DEFAULT '',
  goal_cents INTEGER DEFAULT NULL,
  join_code TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'archived')),
  starts_at TEXT DEFAULT NULL,
  ends_at TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(org_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_funds_org_id ON funds(org_id);
CREATE INDEX IF NOT EXISTS idx_funds_join_code ON funds(join_code);

-- Fund config (inherits from org_config but can override)
CREATE TABLE IF NOT EXISTS fund_config (
  fund_id TEXT PRIMARY KEY REFERENCES funds(id) ON DELETE CASCADE,
  coin_image_key TEXT DEFAULT NULL,
  primary_color TEXT DEFAULT NULL,
  secondary_color TEXT DEFAULT NULL,
  accent_color TEXT DEFAULT NULL,
  currency_name TEXT DEFAULT NULL,
  custom_trivia TEXT DEFAULT NULL,
  price_overrides TEXT DEFAULT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Groups within a fund (e.g., "Youth Group", "Worship Team", "Men's Group")
-- Groups compete against each other on the same fund's leaderboard
CREATE TABLE IF NOT EXISTS fund_groups (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  fund_id TEXT NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#FFD700',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_fund_groups_fund ON fund_groups(fund_id);

-- Player-group memberships (a player can be in one group per fund)
CREATE TABLE IF NOT EXISTS player_groups (
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  fund_id TEXT NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES fund_groups(id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (player_id, fund_id)
);

-- Payment transactions (platform-level audit trail)
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  org_id TEXT NOT NULL REFERENCES orgs(id),
  fund_id TEXT DEFAULT NULL REFERENCES funds(id),
  stripe_payment_intent_id TEXT UNIQUE NOT NULL,
  amount_cents INTEGER NOT NULL,
  platform_fee_cents INTEGER NOT NULL DEFAULT 0,
  stripe_fee_cents INTEGER NOT NULL DEFAULT 0,
  net_cents INTEGER NOT NULL DEFAULT 0,
  type TEXT NOT NULL DEFAULT 'purchase' CHECK (type IN ('purchase', 'sabotage', 'coin_cut', 'campaign', 'skin', 'double_or_nothing', 'rematch', 'custom')),
  player_name TEXT DEFAULT NULL,
  metadata TEXT DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'succeeded' CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_transactions_org ON transactions(org_id);
CREATE INDEX IF NOT EXISTS idx_transactions_fund ON transactions(fund_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at);

-- Platform analytics: daily rollups per org/fund
CREATE TABLE IF NOT EXISTS daily_stats (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  org_id TEXT NOT NULL REFERENCES orgs(id),
  fund_id TEXT DEFAULT NULL,
  date TEXT NOT NULL,
  active_players INTEGER NOT NULL DEFAULT 0,
  new_players INTEGER NOT NULL DEFAULT 0,
  total_clicks INTEGER NOT NULL DEFAULT 0,
  total_coins_earned INTEGER NOT NULL DEFAULT 0,
  gross_revenue_cents INTEGER NOT NULL DEFAULT 0,
  platform_fee_cents INTEGER NOT NULL DEFAULT 0,
  net_revenue_cents INTEGER NOT NULL DEFAULT 0,
  battles_played INTEGER NOT NULL DEFAULT 0,
  sabotages_used INTEGER NOT NULL DEFAULT 0,
  chat_messages INTEGER NOT NULL DEFAULT 0,
  peak_concurrent INTEGER NOT NULL DEFAULT 0,
  UNIQUE(org_id, fund_id, date)
);
CREATE INDEX IF NOT EXISTS idx_daily_stats_org_date ON daily_stats(org_id, date);

-- Payout configuration per org
CREATE TABLE IF NOT EXISTS payout_config (
  org_id TEXT PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
  payout_schedule TEXT NOT NULL DEFAULT 'weekly' CHECK (payout_schedule IN ('daily', 'weekly', 'monthly', 'manual')),
  minimum_payout_cents INTEGER NOT NULL DEFAULT 1000,
  payout_method TEXT NOT NULL DEFAULT 'stripe' CHECK (payout_method IN ('stripe', 'bank_transfer')),
  notification_email TEXT DEFAULT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Platform-level superadmin table (for fundclicker.com ops team)
CREATE TABLE IF NOT EXISTS platform_admins (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'superadmin')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Org invitations (admin invites for multi-admin orgs)
CREATE TABLE IF NOT EXISTS org_invitations (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  token TEXT UNIQUE NOT NULL,
  expires_at TEXT NOT NULL,
  accepted_at TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_org_invitations_token ON org_invitations(token);

-- Add fund_count and metadata to orgs
-- ALTER TABLE orgs ADD COLUMN plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'starter', 'pro', 'enterprise'));
-- Note: SQLite doesn't support CHECK constraints on ALTER, so we'll handle this in app logic
