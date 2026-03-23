// OrgContext: Manages org selection, full config, theming with vibe support,
// character photos, custom trivia, upgrade names, and price overrides.
import React, { createContext, useContext, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "../lib/api";
import { VIBES, getVibeTheme } from "../lib/vibes";
import { DESIGN_TOKENS, getDesignTokens } from "../lib/design-tokens";

const OrgContext = createContext(null);
const STORAGE_KEY = "@fundclicker_org";

// Default theme when no org is selected
const DEFAULT_THEME = {
  primary: "#FFD700",
  secondary: "#1a1a2e",
  accent: "#e94560",
  surface: "#16213e",
  text: "#ffffff",
  textMuted: "#8888aa",
  currencyName: "coins",
  coinEmoji: "\uD83E\uDE99",
  borderRadius: 8,
  vibeId: "retro-arcade",
};

export function OrgProvider({ children }) {
  const [org, setOrg] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load saved org on mount
  React.useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((data) => {
      if (data) {
        try { setOrg(JSON.parse(data)); } catch {}
      }
      setLoading(false);
    });
  }, []);

  const selectOrg = useCallback(async (slug) => {
    const info = await api.getOrgInfo(slug);
    setOrg(info);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(info));
    return info;
  }, []);

  const joinByCode = useCallback(async (code) => {
    const result = await api.joinByCode(code);
    const info = await api.getOrgInfo(result.slug);
    setOrg(info);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(info));
    return info;
  }, []);

  const leaveOrg = useCallback(async () => {
    setOrg(null);
    await AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  // Refresh org config from server (e.g., after admin updates branding)
  const refreshConfig = useCallback(async () => {
    if (!org?.slug) return;
    const info = await api.getOrgInfo(org.slug);
    setOrg(info);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(info));
  }, [org?.slug]);

  // Full theme derived from org config + vibe system
  const theme = React.useMemo(() => {
    if (!org?.config) return DEFAULT_THEME;

    const config = org.config;

    // Parse JSON fields if they're strings (D1 returns them as strings)
    let characterPhotos = [];
    let upgradeNames = {};
    let customTrivia = [];
    let priceOverrides = {};

    try { characterPhotos = typeof config.character_photos === "string" ? JSON.parse(config.character_photos) : (config.character_photos || []); } catch {}
    try { upgradeNames = typeof config.upgrade_names === "string" ? JSON.parse(config.upgrade_names) : (config.upgrade_names || {}); } catch {}
    try { customTrivia = typeof config.custom_trivia === "string" ? JSON.parse(config.custom_trivia) : (config.custom_trivia || []); } catch {}
    try { priceOverrides = typeof config.price_overrides === "string" ? JSON.parse(config.price_overrides) : (config.price_overrides || {}); } catch {}

    // Detect vibe from colors (match against known vibes) or use default
    let vibeId = "retro-arcade";
    for (const [id, vibe] of Object.entries(VIBES)) {
      if (vibe.primary === config.primary_color) {
        vibeId = id;
        break;
      }
    }

    // Get base vibe theme + full design tokens
    const vibeTheme = getVibeTheme(vibeId, config);
    const tokens = getDesignTokens(vibeId);

    return {
      // Colors (org config overrides vibe defaults)
      primary: config.primary_color || vibeTheme.primary,
      secondary: config.secondary_color || vibeTheme.secondary,
      accent: config.accent_color || vibeTheme.accent,
      surface: tokens.colors.surface,
      surfaceLight: tokens.colors.surfaceLight,
      surfaceDark: tokens.colors.surfaceDark,
      text: tokens.colors.text,
      textSecondary: tokens.colors.textSecondary,
      textMuted: tokens.colors.textMuted,
      textDim: tokens.colors.textDim,
      success: tokens.colors.success,
      successDark: tokens.colors.successDark,
      danger: tokens.colors.danger,
      dangerDark: tokens.colors.dangerDark,
      premium: tokens.colors.premium,
      premiumDark: tokens.colors.premiumDark,
      primaryDark: tokens.colors.primaryDark,
      primaryLight: tokens.colors.primaryLight,

      // Typography (from design tokens)
      headingFont: tokens.fonts.heading,
      bodyFont: tokens.fonts.body,
      scoreFont: tokens.fonts.score,
      labelFont: tokens.fonts.label,
      scoreSize: tokens.fonts.scoreSize,
      headingSize: tokens.fonts.headingSize,
      bodySize: tokens.fonts.bodySize,
      labelSize: tokens.fonts.labelSize,
      floatNumberSize: tokens.fonts.floatNumberSize,

      // Text shadows (from design tokens — per-category)
      textShadow: tokens.shadows.gold,
      scoreTextShadow: tokens.shadows.goldHeavy,
      greenShadow: tokens.shadows.green,
      redShadow: tokens.shadows.red,

      // Glow effects (from design tokens)
      glow: tokens.glow,
      glowRadius: tokens.glow.primary.radius,
      glowColor: tokens.glow.primary.color,
      glowColorSubtle: tokens.glow.primarySubtle.color,

      // Borders (from design tokens)
      borderWidth: tokens.borders.width,
      borderWidthThin: tokens.borders.widthThin,
      borderRadius: tokens.borders.radius,
      borderRadiusLarge: tokens.borders.radiusLarge,
      borderColor: tokens.borders.color,
      borderColorMuted: tokens.borders.colorMuted,

      // Gradients (from design tokens)
      gradients: tokens.gradients,
      backgroundGradient: tokens.gradients.background,

      // Sizing (from design tokens)
      coinSize: tokens.sizing.coinButton,
      coinGlowSize: tokens.sizing.coinGlow,
      tabIconSize: tokens.sizing.tabIcon,

      // Animation (from design tokens)
      animation: tokens.animation,
      animationStyle: tokens.animation.style,
      animationDuration: tokens.animation.coinPressDuration,

      // Branding
      currencyName: config.currency_name || "coins",
      coinEmoji: vibeTheme.coinEmoji || "\uD83E\uDE99",
      coinImageKey: config.coin_image_key || null,
      vibeId,

      // Full token set (for advanced component usage)
      tokens,

      // Content (parsed from JSON)
      characterPhotos,
      upgradeNames,
      customTrivia,
      priceOverrides,
    };
  }, [org]);

  return (
    <OrgContext.Provider
      value={{ org, theme, loading, selectOrg, joinByCode, leaveOrg, refreshConfig }}
    >
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error("useOrg must be used within OrgProvider");
  return ctx;
}
