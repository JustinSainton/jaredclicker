// Fund Clicker: Full Design System Vibes
// Each vibe defines not just colors but typography, visual effects,
// sizing, and animation personality. This is what makes each vibe
// feel genuinely different — not just a color swap.

import { FONTS } from "./fonts";

export const VIBES = {
  "retro-arcade": {
    name: "Retro Arcade",

    // Colors
    primary: "#FFD700",
    secondary: "#1a1a2e",
    accent: "#e94560",
    surface: "#16213e",
    text: "#ffffff",
    textMuted: "#8888aa",
    success: "#4ade80",
    danger: "#ef4444",

    // Typography — Press Start 2P for that 8-bit arcade feel
    headingFont: FONTS.pressStart,
    bodyFont: FONTS.fredoka,
    scoreFont: FONTS.pressStart,
    labelFont: FONTS.fredokaBold,

    // Visual effects — neon glow, thick shadows
    textShadow: { width: 2, height: 2, radius: 0, color: "#b8860b" },
    scoreTextShadow: { width: 3, height: 3, radius: 0, color: "#b8860b" },
    glowRadius: 30,
    glowColor: "rgba(255, 215, 0, 0.6)",
    glowColorSubtle: "rgba(255, 215, 0, 0.15)",
    borderWidth: 3,
    backgroundGradient: ["#1a1a2e", "#16213e", "#0f3460"],

    // Sizing
    coinSize: 260,
    coinEmoji: "\uD83E\uDE99",
    borderRadius: 8,

    // Animation
    animationStyle: "bouncy",
    animationDuration: 200,
  },

  "modern-minimal": {
    name: "Modern Minimal",

    primary: "#6366f1",
    secondary: "#0f172a",
    accent: "#f59e0b",
    surface: "#1e293b",
    text: "#f1f5f9",
    textMuted: "#94a3b8",
    success: "#22c55e",
    danger: "#ef4444",

    // Typography — clean sans-serif, no decorative fonts
    headingFont: null, // system font
    bodyFont: null,
    scoreFont: null, // tabular-nums via fontVariant
    labelFont: null,

    textShadow: null,
    scoreTextShadow: null,
    glowRadius: 10,
    glowColor: "rgba(99, 102, 241, 0.3)",
    glowColorSubtle: "rgba(99, 102, 241, 0.08)",
    borderWidth: 1,
    backgroundGradient: null, // flat color

    coinSize: 180,
    coinEmoji: "\uD83D\uDCB0",
    borderRadius: 16,

    animationStyle: "smooth",
    animationDuration: 400,
  },

  "nature-earth": {
    name: "Nature & Earth",

    primary: "#d97706",
    secondary: "#1c1917",
    accent: "#65a30d",
    surface: "#292524",
    text: "#fafaf9",
    textMuted: "#a8a29e",
    success: "#16a34a",
    danger: "#dc2626",

    // Typography — warm serif for headings, readable sans for body
    headingFont: FONTS.loraBold,
    bodyFont: FONTS.lora,
    scoreFont: FONTS.loraSemiBold,
    labelFont: FONTS.loraSemiBold,

    textShadow: null,
    scoreTextShadow: { width: 1, height: 1, radius: 2, color: "rgba(0,0,0,0.4)" },
    glowRadius: 15,
    glowColor: "rgba(217, 119, 6, 0.4)",
    glowColorSubtle: "rgba(217, 119, 6, 0.1)",
    borderWidth: 2,
    backgroundGradient: ["#1c1917", "#292524"],

    coinSize: 200,
    coinEmoji: "\uD83C\uDF3F",
    borderRadius: 12,

    animationStyle: "smooth",
    animationDuration: 350,
  },

  "neon-cyber": {
    name: "Neon Cyber",

    primary: "#06b6d4",
    secondary: "#020617",
    accent: "#f43f5e",
    surface: "#0f172a",
    text: "#e2e8f0",
    textMuted: "#64748b",
    success: "#10b981",
    danger: "#f43f5e",

    // Typography — futuristic monospace-style
    headingFont: FONTS.orbitronBold,
    bodyFont: null, // system sans
    scoreFont: FONTS.orbitron,
    labelFont: FONTS.orbitronBold,

    textShadow: { width: 0, height: 0, radius: 8, color: "#06b6d4" },
    scoreTextShadow: { width: 0, height: 0, radius: 12, color: "#06b6d4" },
    glowRadius: 25,
    glowColor: "rgba(6, 182, 212, 0.5)",
    glowColorSubtle: "rgba(6, 182, 212, 0.1)",
    borderWidth: 1,
    backgroundGradient: ["#020617", "#0f172a"],

    coinSize: 200,
    coinEmoji: "\u26A1",
    borderRadius: 6,

    animationStyle: "snappy",
    animationDuration: 150,
  },

  "pastel-pop": {
    name: "Pastel Pop",

    primary: "#c084fc",
    secondary: "#faf5ff",
    accent: "#fb923c",
    surface: "#f3e8ff",
    text: "#1e1b4b",
    textMuted: "#7c3aed",
    success: "#34d399",
    danger: "#fb7185",

    // Typography — bubbly rounded sans
    headingFont: FONTS.quicksandBold,
    bodyFont: FONTS.quicksand,
    scoreFont: FONTS.quicksandBold,
    labelFont: FONTS.quicksandSemiBold,

    textShadow: null,
    scoreTextShadow: null,
    glowRadius: 12,
    glowColor: "rgba(192, 132, 252, 0.3)",
    glowColorSubtle: "rgba(192, 132, 252, 0.08)",
    borderWidth: 3,
    backgroundGradient: ["#faf5ff", "#f3e8ff", "#ede9fe"],

    coinSize: 200,
    coinEmoji: "\uD83C\uDF1F",
    borderRadius: 24,

    animationStyle: "bouncy",
    animationDuration: 300,
  },

  "classic-gold": {
    name: "Classic Gold",

    primary: "#ca8a04",
    secondary: "#0c1222",
    accent: "#b91c1c",
    surface: "#1a2332",
    text: "#fefce8",
    textMuted: "#a3a3a3",
    success: "#15803d",
    danger: "#b91c1c",

    // Typography — elegant serif
    headingFont: FONTS.playfairBold,
    bodyFont: FONTS.playfair,
    scoreFont: FONTS.playfairSemiBold,
    labelFont: FONTS.playfairSemiBold,

    textShadow: null,
    scoreTextShadow: { width: 1, height: 1, radius: 3, color: "rgba(202,138,4,0.3)" },
    glowRadius: 20,
    glowColor: "rgba(202, 138, 4, 0.4)",
    glowColorSubtle: "rgba(202, 138, 4, 0.1)",
    borderWidth: 2,
    backgroundGradient: ["#0c1222", "#1a2332"],

    coinSize: 200,
    coinEmoji: "\uD83C\uDFC6",
    borderRadius: 4,

    animationStyle: "smooth",
    animationDuration: 500,
  },
};

export function getVibeTheme(vibeId, orgConfig) {
  const base = VIBES[vibeId] || VIBES["retro-arcade"];

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
