-- Fund Clicker: Multi-tenant platform schema
-- Each org gets its own Durable Object for game state;
-- D1 stores platform-level data only.

-- Organizations
CREATE TABLE IF NOT EXISTS orgs (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  join_code TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'suspended')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_orgs_slug ON orgs(slug);
CREATE INDEX IF NOT EXISTS idx_orgs_join_code ON orgs(join_code);

-- Org administrators (email/password auth)
CREATE TABLE IF NOT EXISTS org_admins (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('owner', 'admin')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(org_id, email)
);
CREATE INDEX IF NOT EXISTS idx_org_admins_email ON org_admins(email);

-- Stripe Connect accounts (one per org)
CREATE TABLE IF NOT EXISTS stripe_accounts (
  org_id TEXT PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
  stripe_account_id TEXT UNIQUE NOT NULL,
  charges_enabled INTEGER NOT NULL DEFAULT 0,
  onboarding_complete INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Org branding/config (white-label customization)
CREATE TABLE IF NOT EXISTS org_config (
  org_id TEXT PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
  coin_image_key TEXT DEFAULT NULL,
  primary_color TEXT NOT NULL DEFAULT '#FFD700',
  secondary_color TEXT NOT NULL DEFAULT '#1a1a2e',
  accent_color TEXT NOT NULL DEFAULT '#e94560',
  currency_name TEXT NOT NULL DEFAULT 'coins',
  character_photos TEXT NOT NULL DEFAULT '[]',
  upgrade_names TEXT NOT NULL DEFAULT '{}',
  custom_trivia TEXT NOT NULL DEFAULT '[]',
  price_overrides TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Players (cross-org identity via device fingerprint)
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  device_id TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL DEFAULT 'Player',
  email TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_players_device_id ON players(device_id);

-- Player-org memberships
CREATE TABLE IF NOT EXISTS player_orgs (
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (player_id, org_id)
);
