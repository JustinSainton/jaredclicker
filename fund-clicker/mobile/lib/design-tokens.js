// Fund Clicker: Complete Design Token System
// Derived from jaredclicker.com visual audit. Every visual property is a token
// that can be overridden per-vibe. This is the single source of truth for the
// entire app's visual language.
//
// Tokens are grouped by category and consumed by components via theme-styles.js

import { FONTS } from "./fonts";

// ─── ASSET DEFINITIONS ───────────────────────────────────────────────────────
// Each vibe needs these assets (stored in R2: /vibes/{vibeId}/{assetName}.png)
// Generate via Gemini/Nano Banana with vibe-specific prompts

export const VIBE_ASSETS = {
  coin: "coin.png",         // The main clickable coin (1024x1024)
  background: "bg.png",     // Optional background texture
  particle: "particle.png", // Particle sprite for effects
  icon: "icon.png",         // App icon / tab icon variant
  splash: "splash.png",     // Splash/loading screen accent
};

// Gemini prompts for generating vibe-specific coin images
export const VIBE_COIN_PROMPTS = {
  "retro-arcade": "A golden pixel art coin in 8-bit retro arcade style, dark transparent background, glowing neon gold edges, single coin centered, 1024x1024 pixels",
  "modern-minimal": "A sleek modern silver and indigo gradient coin, minimal design, clean smooth edges, dark transparent background, centered, 1024x1024 pixels",
  "nature-earth": "A rustic wooden coin with leaf engravings, warm amber tones, organic texture, earthy feel, dark transparent background, centered, 1024x1024 pixels",
  "neon-cyber": "A holographic cyan neon circuit board coin, glowing electric edges, cyberpunk aesthetic, dark transparent background, centered, 1024x1024 pixels",
  "pastel-pop": "A soft pastel purple and orange gradient coin with star shapes, bubbly playful style, light sparkle effects, transparent background, centered, 1024x1024 pixels",
  "classic-gold": "An ornate gold medallion coin with classical engravings, deep rich gold, elegant timeless design, dark transparent background, centered, 1024x1024 pixels",
};

// ─── COMPLETE VIBE DEFINITIONS ───────────────────────────────────────────────
// Each vibe is a complete visual language, not just colors

export const DESIGN_TOKENS = {
  "retro-arcade": {
    name: "Retro Arcade",
    description: "8-bit pixel art nostalgia. Neon glow. Arcade cabinet energy.",

    // ── Colors (from jaredclicker.com audit)
    colors: {
      primary: "#FFD700",
      primaryDark: "#b8860b",
      primaryLight: "#ffed4a",
      secondary: "#1a1a2e",
      accent: "#e94560",
      surface: "#16213e",
      surfaceLight: "#2a2a4a",
      surfaceDark: "#0f3460",
      text: "#ffffff",
      textSecondary: "#daa520",
      textMuted: "#888888",
      textDim: "#555555",
      success: "#4ade80",
      successDark: "#065f46",
      danger: "#ef4444",
      dangerDark: "#991b1b",
      premium: "#a855f7",
      premiumDark: "#6d28d9",
    },

    // ── Gradients
    gradients: {
      background: ["#1a1a2e", "#16213e", "#0f3460"],
      card: ["#2a2a4a", "#1a1a3a"],
      button: ["#b8860b", "#ffd700"],
      premium: ["#2d1b69", "#1a1a3a"],
    },

    // ── Typography
    fonts: {
      heading: FONTS.pressStart,
      body: FONTS.fredoka,
      score: FONTS.pressStart,
      label: FONTS.fredokaBold,
      // Sizes follow jaredclicker.com exactly
      scoreSize: 28,       // .coin-counter .count
      headingSize: 24,     // section headings
      bodySize: 14,        // body text
      labelSize: 12,       // small labels
      floatNumberSize: 24, // floating "+X" numbers
    },

    // ── Text Shadows (the signature retro effect)
    shadows: {
      gold: { width: 2, height: 2, radius: 0, color: "#b8860b" },
      goldHeavy: { width: 3, height: 3, radius: 0, color: "#b8860b" },
      green: { width: 1, height: 1, radius: 0, color: "#065f46" },
      red: { width: 1, height: 1, radius: 0, color: "#7c0000" },
      none: null,
    },

    // ── Box Shadows / Glow
    glow: {
      primary: { radius: 30, color: "rgba(255,215,0,0.6)" },
      primarySubtle: { radius: 20, color: "rgba(255,215,0,0.3)" },
      premium: { radius: 20, color: "rgba(168,85,247,0.4)" },
      danger: { radius: 15, color: "rgba(239,68,68,0.3)" },
    },

    // ── Borders
    borders: {
      width: 3,
      widthThin: 2,
      radius: 8,
      radiusLarge: 16,
      radiusRound: 50,
      color: "#ffd700",
      colorMuted: "#555",
    },

    // ── Sizing
    sizing: {
      coinButton: 280,     // 300px on web, slightly smaller on mobile
      coinGlow: 320,
      upgradeCard: { padding: 16 },
      tabIcon: 28,
    },

    // ── Animations
    animation: {
      style: "bouncy",
      coinPressDuration: 100,
      floatDuration: 1000,
      toastDuration: 3000,
      springFriction: 3,
      springTension: 200,
    },
  },

  "modern-minimal": {
    name: "Modern Minimal",
    description: "Clean lines. Soft depth. Sophisticated simplicity.",

    colors: {
      primary: "#6366f1",
      primaryDark: "#4f46e5",
      primaryLight: "#818cf8",
      secondary: "#0f172a",
      accent: "#f59e0b",
      surface: "#1e293b",
      surfaceLight: "#334155",
      surfaceDark: "#0f172a",
      text: "#f1f5f9",
      textSecondary: "#94a3b8",
      textMuted: "#64748b",
      textDim: "#475569",
      success: "#22c55e",
      successDark: "#15803d",
      danger: "#ef4444",
      dangerDark: "#b91c1c",
      premium: "#8b5cf6",
      premiumDark: "#6d28d9",
    },

    gradients: {
      background: null,
      card: null,
      button: ["#4f46e5", "#6366f1"],
      premium: ["#4c1d95", "#1e1b4b"],
    },

    fonts: {
      heading: null,  // system font
      body: null,
      score: null,
      label: null,
      scoreSize: 36,
      headingSize: 24,
      bodySize: 15,
      labelSize: 12,
      floatNumberSize: 22,
    },

    shadows: {
      gold: null,
      goldHeavy: null,
      green: null,
      red: null,
      none: null,
    },

    glow: {
      primary: { radius: 10, color: "rgba(99,102,241,0.3)" },
      primarySubtle: { radius: 8, color: "rgba(99,102,241,0.15)" },
      premium: { radius: 10, color: "rgba(139,92,246,0.3)" },
      danger: { radius: 8, color: "rgba(239,68,68,0.2)" },
    },

    borders: {
      width: 1,
      widthThin: 1,
      radius: 16,
      radiusLarge: 20,
      radiusRound: 50,
      color: "#334155",
      colorMuted: "#1e293b",
    },

    sizing: {
      coinButton: 180,
      coinGlow: 220,
      upgradeCard: { padding: 14 },
      tabIcon: 24,
    },

    animation: {
      style: "smooth",
      coinPressDuration: 200,
      floatDuration: 800,
      toastDuration: 2500,
      springFriction: 6,
      springTension: 150,
    },
  },

  "nature-earth": {
    name: "Nature & Earth",
    description: "Warm tones. Organic textures. Grounded and inviting.",

    colors: {
      primary: "#d97706",
      primaryDark: "#92400e",
      primaryLight: "#fbbf24",
      secondary: "#1c1917",
      accent: "#65a30d",
      surface: "#292524",
      surfaceLight: "#44403c",
      surfaceDark: "#1c1917",
      text: "#fafaf9",
      textSecondary: "#d6d3d1",
      textMuted: "#a8a29e",
      textDim: "#78716c",
      success: "#16a34a",
      successDark: "#14532d",
      danger: "#dc2626",
      dangerDark: "#991b1b",
      premium: "#a855f7",
      premiumDark: "#6d28d9",
    },

    gradients: {
      background: ["#1c1917", "#292524"],
      card: ["#292524", "#1c1917"],
      button: ["#92400e", "#d97706"],
      premium: null,
    },

    fonts: {
      heading: FONTS.loraBold,
      body: FONTS.lora,
      score: FONTS.loraSemiBold,
      label: FONTS.loraSemiBold,
      scoreSize: 32,
      headingSize: 24,
      bodySize: 15,
      labelSize: 13,
      floatNumberSize: 22,
    },

    shadows: {
      gold: { width: 1, height: 1, radius: 2, color: "rgba(0,0,0,0.4)" },
      goldHeavy: { width: 1, height: 2, radius: 3, color: "rgba(0,0,0,0.5)" },
      green: null,
      red: null,
      none: null,
    },

    glow: {
      primary: { radius: 15, color: "rgba(217,119,6,0.4)" },
      primarySubtle: { radius: 10, color: "rgba(217,119,6,0.2)" },
      premium: { radius: 12, color: "rgba(168,85,247,0.3)" },
      danger: { radius: 10, color: "rgba(220,38,38,0.3)" },
    },

    borders: {
      width: 2,
      widthThin: 1,
      radius: 12,
      radiusLarge: 16,
      radiusRound: 50,
      color: "#78716c",
      colorMuted: "#44403c",
    },

    sizing: {
      coinButton: 200,
      coinGlow: 240,
      upgradeCard: { padding: 16 },
      tabIcon: 26,
    },

    animation: {
      style: "smooth",
      coinPressDuration: 150,
      floatDuration: 900,
      toastDuration: 3000,
      springFriction: 5,
      springTension: 160,
    },
  },

  "neon-cyber": {
    name: "Neon Cyber",
    description: "Electric colors. Dark vibes. Futuristic edge.",

    colors: {
      primary: "#06b6d4",
      primaryDark: "#0e7490",
      primaryLight: "#22d3ee",
      secondary: "#020617",
      accent: "#f43f5e",
      surface: "#0f172a",
      surfaceLight: "#1e293b",
      surfaceDark: "#020617",
      text: "#e2e8f0",
      textSecondary: "#94a3b8",
      textMuted: "#64748b",
      textDim: "#475569",
      success: "#10b981",
      successDark: "#064e3b",
      danger: "#f43f5e",
      dangerDark: "#9f1239",
      premium: "#a855f7",
      premiumDark: "#7c3aed",
    },

    gradients: {
      background: ["#020617", "#0f172a"],
      card: ["#0f172a", "#020617"],
      button: ["#0e7490", "#06b6d4"],
      premium: ["#4c1d95", "#0f172a"],
    },

    fonts: {
      heading: FONTS.orbitronBold,
      body: null,
      score: FONTS.orbitron,
      label: FONTS.orbitronBold,
      scoreSize: 30,
      headingSize: 22,
      bodySize: 14,
      labelSize: 11,
      floatNumberSize: 22,
    },

    shadows: {
      gold: { width: 0, height: 0, radius: 8, color: "#06b6d4" },
      goldHeavy: { width: 0, height: 0, radius: 12, color: "#06b6d4" },
      green: { width: 0, height: 0, radius: 6, color: "#10b981" },
      red: { width: 0, height: 0, radius: 6, color: "#f43f5e" },
      none: null,
    },

    glow: {
      primary: { radius: 25, color: "rgba(6,182,212,0.5)" },
      primarySubtle: { radius: 15, color: "rgba(6,182,212,0.2)" },
      premium: { radius: 20, color: "rgba(168,85,247,0.4)" },
      danger: { radius: 15, color: "rgba(244,63,94,0.4)" },
    },

    borders: {
      width: 1,
      widthThin: 1,
      radius: 6,
      radiusLarge: 10,
      radiusRound: 50,
      color: "#06b6d4",
      colorMuted: "#1e293b",
    },

    sizing: {
      coinButton: 200,
      coinGlow: 240,
      upgradeCard: { padding: 14 },
      tabIcon: 24,
    },

    animation: {
      style: "snappy",
      coinPressDuration: 80,
      floatDuration: 600,
      toastDuration: 2000,
      springFriction: 4,
      springTension: 250,
    },
  },

  "pastel-pop": {
    name: "Pastel Pop",
    description: "Soft pastels. Bubbly shapes. Joyful and light.",

    colors: {
      primary: "#c084fc",
      primaryDark: "#9333ea",
      primaryLight: "#d8b4fe",
      secondary: "#faf5ff",
      accent: "#fb923c",
      surface: "#f3e8ff",
      surfaceLight: "#faf5ff",
      surfaceDark: "#ede9fe",
      text: "#1e1b4b",
      textSecondary: "#6d28d9",
      textMuted: "#7c3aed",
      textDim: "#a78bfa",
      success: "#34d399",
      successDark: "#059669",
      danger: "#fb7185",
      dangerDark: "#e11d48",
      premium: "#a855f7",
      premiumDark: "#7c3aed",
    },

    gradients: {
      background: ["#faf5ff", "#f3e8ff", "#ede9fe"],
      card: ["#f3e8ff", "#ede9fe"],
      button: ["#9333ea", "#c084fc"],
      premium: ["#7c3aed", "#c084fc"],
    },

    fonts: {
      heading: FONTS.quicksandBold,
      body: FONTS.quicksand,
      score: FONTS.quicksandBold,
      label: FONTS.quicksandSemiBold,
      scoreSize: 34,
      headingSize: 24,
      bodySize: 15,
      labelSize: 12,
      floatNumberSize: 24,
    },

    shadows: {
      gold: null,
      goldHeavy: null,
      green: null,
      red: null,
      none: null,
    },

    glow: {
      primary: { radius: 12, color: "rgba(192,132,252,0.3)" },
      primarySubtle: { radius: 8, color: "rgba(192,132,252,0.15)" },
      premium: { radius: 12, color: "rgba(168,85,247,0.3)" },
      danger: { radius: 8, color: "rgba(251,113,133,0.3)" },
    },

    borders: {
      width: 3,
      widthThin: 2,
      radius: 24,
      radiusLarge: 28,
      radiusRound: 50,
      color: "#d8b4fe",
      colorMuted: "#ede9fe",
    },

    sizing: {
      coinButton: 200,
      coinGlow: 240,
      upgradeCard: { padding: 18 },
      tabIcon: 26,
    },

    animation: {
      style: "bouncy",
      coinPressDuration: 120,
      floatDuration: 1000,
      toastDuration: 3000,
      springFriction: 3,
      springTension: 180,
    },
  },

  "classic-gold": {
    name: "Classic Gold",
    description: "Rich golds. Deep navy. Timeless elegance.",

    colors: {
      primary: "#ca8a04",
      primaryDark: "#854d0e",
      primaryLight: "#eab308",
      secondary: "#0c1222",
      accent: "#b91c1c",
      surface: "#1a2332",
      surfaceLight: "#253344",
      surfaceDark: "#0c1222",
      text: "#fefce8",
      textSecondary: "#d4d4d8",
      textMuted: "#a3a3a3",
      textDim: "#737373",
      success: "#15803d",
      successDark: "#14532d",
      danger: "#b91c1c",
      dangerDark: "#7f1d1d",
      premium: "#a855f7",
      premiumDark: "#6d28d9",
    },

    gradients: {
      background: ["#0c1222", "#1a2332"],
      card: ["#1a2332", "#0c1222"],
      button: ["#854d0e", "#ca8a04"],
      premium: null,
    },

    fonts: {
      heading: FONTS.playfairBold,
      body: FONTS.playfair,
      score: FONTS.playfairSemiBold,
      label: FONTS.playfairSemiBold,
      scoreSize: 34,
      headingSize: 26,
      bodySize: 16,
      labelSize: 13,
      floatNumberSize: 24,
    },

    shadows: {
      gold: { width: 1, height: 1, radius: 3, color: "rgba(202,138,4,0.3)" },
      goldHeavy: { width: 2, height: 2, radius: 4, color: "rgba(202,138,4,0.4)" },
      green: null,
      red: null,
      none: null,
    },

    glow: {
      primary: { radius: 20, color: "rgba(202,138,4,0.4)" },
      primarySubtle: { radius: 12, color: "rgba(202,138,4,0.2)" },
      premium: { radius: 15, color: "rgba(168,85,247,0.3)" },
      danger: { radius: 12, color: "rgba(185,28,28,0.3)" },
    },

    borders: {
      width: 2,
      widthThin: 1,
      radius: 4,
      radiusLarge: 8,
      radiusRound: 50,
      color: "#ca8a04",
      colorMuted: "#253344",
    },

    sizing: {
      coinButton: 200,
      coinGlow: 240,
      upgradeCard: { padding: 16 },
      tabIcon: 26,
    },

    animation: {
      style: "smooth",
      coinPressDuration: 180,
      floatDuration: 1000,
      toastDuration: 3500,
      springFriction: 6,
      springTension: 140,
    },
  },
};

// ─── HELPER: Get full token set for a vibe ───────────────────────────────────

export function getDesignTokens(vibeId) {
  return DESIGN_TOKENS[vibeId] || DESIGN_TOKENS["retro-arcade"];
}

// ─── HELPER: Get R2 asset URL for a vibe ─────────────────────────────────────

export function getVibeAssetUrl(vibeId, assetName, baseUrl = "https://api.fundclicker.com") {
  return `${baseUrl}/vibes/${vibeId}/${assetName}`;
}
