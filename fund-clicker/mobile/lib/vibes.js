// Fund Clicker: Theme Vibes for React Native
// Pre-designed aesthetic packages — synced with admin portal vibes.js

export const VIBES = {
  "retro-arcade": {
    name: "Retro Arcade",
    primary: "#FFD700",
    secondary: "#1a1a2e",
    accent: "#e94560",
    surface: "#16213e",
    text: "#ffffff",
    textMuted: "#8888aa",
    coinEmoji: "\uD83E\uDE99",
    borderRadius: 8,
  },
  "modern-minimal": {
    name: "Modern Minimal",
    primary: "#6366f1",
    secondary: "#0f172a",
    accent: "#f59e0b",
    surface: "#1e293b",
    text: "#f1f5f9",
    textMuted: "#94a3b8",
    coinEmoji: "\uD83D\uDCB0",
    borderRadius: 16,
  },
  "nature-earth": {
    name: "Nature & Earth",
    primary: "#d97706",
    secondary: "#1c1917",
    accent: "#65a30d",
    surface: "#292524",
    text: "#fafaf9",
    textMuted: "#a8a29e",
    coinEmoji: "\uD83C\uDF3F",
    borderRadius: 12,
  },
  "neon-cyber": {
    name: "Neon Cyber",
    primary: "#06b6d4",
    secondary: "#020617",
    accent: "#f43f5e",
    surface: "#0f172a",
    text: "#e2e8f0",
    textMuted: "#64748b",
    coinEmoji: "\u26A1",
    borderRadius: 6,
  },
  "pastel-pop": {
    name: "Pastel Pop",
    primary: "#c084fc",
    secondary: "#faf5ff",
    accent: "#fb923c",
    surface: "#f3e8ff",
    text: "#1e1b4b",
    textMuted: "#7c3aed",
    coinEmoji: "\uD83C\uDF1F",
    borderRadius: 20,
  },
  "classic-gold": {
    name: "Classic Gold",
    primary: "#ca8a04",
    secondary: "#0c1222",
    accent: "#b91c1c",
    surface: "#1a2332",
    text: "#fefce8",
    textMuted: "#a3a3a3",
    coinEmoji: "\uD83C\uDFC6",
    borderRadius: 4,
  },
};

export function getVibeTheme(vibeId, orgConfig) {
  const base = VIBES[vibeId] || VIBES["retro-arcade"];

  // Org config colors override the vibe defaults
  if (orgConfig) {
    return {
      ...base,
      primary: orgConfig.primary_color || base.primary,
      secondary: orgConfig.secondary_color || base.secondary,
      accent: orgConfig.accent_color || base.accent,
      currencyName: orgConfig.currency_name || "coins",
    };
  }

  return { ...base, currencyName: "coins" };
}
