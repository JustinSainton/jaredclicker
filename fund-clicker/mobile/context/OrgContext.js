// OrgContext: Manages org selection, full config, theming with vibe support,
// character photos, custom trivia, upgrade names, and price overrides.
import React, { createContext, useContext, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "../lib/api";
import { VIBES, getVibeTheme } from "../lib/vibes";

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

    // Get base vibe theme, then override with org-specific colors
    const vibeTheme = getVibeTheme(vibeId, config);

    return {
      // Colors (org config overrides vibe defaults)
      primary: config.primary_color || vibeTheme.primary,
      secondary: config.secondary_color || vibeTheme.secondary,
      accent: config.accent_color || vibeTheme.accent,
      surface: vibeTheme.surface || "#16213e",
      text: vibeTheme.text || "#ffffff",
      textMuted: vibeTheme.textMuted || "#8888aa",

      // Branding
      currencyName: config.currency_name || "coins",
      coinEmoji: vibeTheme.coinEmoji || "\uD83E\uDE99",
      coinImageKey: config.coin_image_key || null,
      borderRadius: vibeTheme.borderRadius || 12,
      vibeId,

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
