// Game wrapper — loads org, provides GameContext, renders tab navigator
// Staff-engineer quality: proper auth flow, real TextInputs, org branding,
// unread chat badge, ActiveGameModal, haptics, keyboard handling
import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Image,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Keyboard,
  TouchableWithoutFeedback,
} from "react-native";
import * as Haptics from "../../lib/haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import t from "../../lib/i18n";
import { hashPin } from "../../lib/crypto";
import { headingStyle } from "../../lib/theme-styles";
import { useLayout } from "../../hooks/useLayout";
import { useOrg } from "../../context/OrgContext";
import { GameProvider, useGame } from "../../context/GameContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useGameState } from "../../hooks/useGameState";
import { formatNumber } from "../../lib/gameEngine";
import { getVibeAsset } from "../../lib/vibe-assets";
import usePushNotifications from "../../hooks/usePushNotifications";
import ClickerScreen from "../../components/ClickerScreen";
import LeaderboardScreen from "../../components/LeaderboardScreen";
import BattleScreen from "../../components/BattleScreen";
import ShopScreen from "../../components/ShopScreen";
import ChatScreen from "../../components/ChatScreen";
import ActiveGameModal from "../../components/games/ActiveGameModal";
import BanOverlay from "../../components/BanOverlay";
let GlassView;
try {
  // Glass effect (liquid glass) requires iOS 26+
  const iosVersion = parseInt(Platform.Version, 10);
  if (Platform.OS === "ios" && iosVersion >= 26) {
    GlassView = require("expo-glass-effect").GlassView;
  }
} catch { GlassView = null; }
import ProfileScreen from "../../components/ProfileScreen";
import SkinsScreen from "../../components/SkinsScreen";

// ─── AUTH GATE ────────────────────────────────────────────────────────────────
// Full auth screen with real TextInputs, org branding, PIN input, error handling

function AuthGate({ orgSlug, children }) {
  const { player, registerPlayer, loginPlayer } = useGame();
  const { org, theme } = useOrg();
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [mode, setMode] = useState("register");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const nameRef = useRef(null);
  const pinRef = useRef(null);

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
  }, []);

  if (player) return children;

  const handleSubmit = async () => {
    Keyboard.dismiss();
    const trimName = name.trim();
    if (!trimName) {
      setError(t("nameRequired"));
      nameRef.current?.focus();
      return;
    }
    if (trimName.length > 20) {
      setError(t("nameTooLong"));
      return;
    }
    if (pin.length < 4) {
      setError(t("pinTooShort"));
      pinRef.current?.focus();
      return;
    }

    setBusy(true);
    setError("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      // Hash PIN client-side before sending (defense in depth)
      const hashedPin = await hashPin(pin);
      if (mode === "register") {
        await registerPlayer(trimName, hashedPin);
      } else {
        await loginPlayer(trimName, hashedPin);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      setError(e.message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
    setBusy(false);
  };

  const switchMode = () => {
    setMode(mode === "login" ? "register" : "login");
    setError("");
    Haptics.selectionAsync();
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <KeyboardAvoidingView
        style={[styles.authContainer, { backgroundColor: theme.secondary }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Animated.View style={[styles.authContent, { opacity: fadeAnim }]}>
          {/* Org branding */}
          <View style={styles.authBranding}>
            <Text style={styles.authCoinEmoji}>{"\uD83E\uDE99"}</Text>
            <Text style={[styles.authOrgName, { color: theme.primary }]}>
              {org?.name || "Fund Clicker"}
            </Text>
            {org?.description ? (
              <Text style={styles.authOrgDesc} numberOfLines={2}>{org.description}</Text>
            ) : null}
          </View>

          <Text style={[styles.authTitle, headingStyle(theme), { color: theme.primary }]}>
            {mode === "register" ? t("joinTheGame") : t("welcomeBack")}
          </Text>
          <Text style={styles.authSubtitle}>
            {mode === "register" ? t("createAccount") : t("loginSubtitle")}
          </Text>

          {/* Error */}
          {error ? (
            <View style={styles.authErrorBox}>
              <Text style={styles.authErrorText}>{error}</Text>
            </View>
          ) : null}

          {/* Name input */}
          <View style={styles.authField}>
            <Text style={styles.authLabel}>{t("displayName")}</Text>
            <TextInput
              ref={nameRef}
              style={[styles.authInput, { borderColor: error && !name.trim() ? "#ef4444" : "#333" }]}
              value={name}
              onChangeText={setName}
              placeholder={t("displayNamePlaceholder")}
              placeholderTextColor="#555"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={20}
              returnKeyType="next"
              onSubmitEditing={() => pinRef.current?.focus()}
              blurOnSubmit={false}
            />
            <Text style={styles.authHint}>{t("displayNameHint")}</Text>
          </View>

          {/* PIN input */}
          <View style={styles.authField}>
            <Text style={styles.authLabel}>{t("pin")}</Text>
            <TextInput
              ref={pinRef}
              style={[styles.authInput, styles.authPinInput, { borderColor: error && pin.length < 4 ? "#ef4444" : "#333" }]}
              value={pin}
              onChangeText={(t) => setPin(t.replace(/[^0-9]/g, ""))}
              placeholder={t("pinPlaceholder")}
              placeholderTextColor="#555"
              keyboardType="number-pad"
              secureTextEntry={true}
              maxLength={8}
              returnKeyType="go"
              onSubmitEditing={handleSubmit}
            />
            <Text style={styles.authHint}>{t("pinHint")}</Text>
          </View>

          {/* Submit button */}
          <TouchableOpacity
            style={[
              styles.authButton,
              { backgroundColor: theme.primary },
              busy && { opacity: 0.6 },
            ]}
            onPress={handleSubmit}
            disabled={busy}
            activeOpacity={0.8}
          >
            {busy ? (
              <ActivityIndicator color={theme.secondary} size="small" />
            ) : (
              <Text style={[styles.authButtonText, { color: theme.secondary }]}>
                {mode === "register" ? t("createAccountAndPlay") : t("logInAndPlay")}
              </Text>
            )}
          </TouchableOpacity>

          {/* Switch mode */}
          <TouchableOpacity onPress={switchMode} style={styles.authSwitchBtn}>
            <Text style={styles.authSwitch}>
              {mode === "login" ? t("newHere") : t("alreadyHaveAccount")}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
}

// ─── GAME TABS ────────────────────────────────────────────────────────────────

function GameTabs() {
  const { org, theme } = useOrg();
  const { connected, chatMessages, player, totalRaised, leaderboard } = useGame();
  const { gameState } = useGameState();
  const router = useRouter();
  const layout = useLayout();
  const [activeTab, setActiveTab] = useState("click");
  const [showProfile, setShowProfile] = useState(false);
  const [lastSeenChatCount, setLastSeenChatCount] = useState(null);

  // Register push notifications after login
  usePushNotifications(org?.slug, player?.name, player?.token);

  // Load persisted chat count on mount
  useEffect(() => {
    AsyncStorage.getItem("@fc_lastSeenChat_" + (org?.slug || "")).then(v => {
      setLastSeenChatCount(v ? Number(v) : 0);
    });
  }, [org?.slug]);

  // Track unread chat messages (null = still loading, show 0)
  const unreadChat = lastSeenChatCount === null || activeTab === "chat" ? 0 : Math.max(0, chatMessages.length - lastSeenChatCount);

  // When switching to chat tab, mark all as read
  const handleTabPress = useCallback((key) => {
    Haptics.selectionAsync();
    if (key === "chat") {
      setLastSeenChatCount(chatMessages.length);
      AsyncStorage.setItem("@fc_lastSeenChat_" + (org?.slug || ""), String(chatMessages.length));
    }
    setActiveTab(key);
  }, [chatMessages.length, org?.slug]);

  // Update seen count when chat tab is active and new messages arrive
  useEffect(() => {
    if (activeTab === "chat") {
      setLastSeenChatCount(chatMessages.length);
    }
  }, [activeTab, chatMessages.length]);

  const tabs = [
    { key: "click", label: t("tabClick"), icon: "\uD83E\uDE99" },
    { key: "board", label: t("tabBoard"), icon: "\uD83C\uDFC6", iconKey: "tab_board" },
    { key: "battle", label: t("tabBattle"), icon: "\u2694\uFE0F", iconKey: "tab_battle" },
    { key: "shop", label: t("tabShop"), icon: "\uD83D\uDED2", iconKey: "tab_shop" },
    { key: "skins", label: t("skins"), icon: "\uD83C\uDFA8", iconKey: "tab_skins" },
    { key: "chat", label: t("tabChat"), icon: "\uD83D\uDCAC", badge: unreadChat },
  ];

  // Build tab icon URLs from R2 for the current vibe
  const vibeId = theme.vibeId || "retro-arcade";
  // Use local bundled assets (instant) with remote fallback
  const getTabIcon = (iconKey) => getVibeAsset(vibeId, iconKey);

  const renderScreen = () => {
    switch (activeTab) {
      case "click": return <ClickerScreen />;
      case "board": return <LeaderboardScreen />;
      case "battle": return <BattleScreen />;
      case "shop": return <ShopScreen />;
      case "skins": return <SkinsScreen />;
      case "chat": return <ChatScreen />;
      default: return <ClickerScreen />;
    }
  };

  const useSidebar = layout.isWide;

  return (
    <View style={[styles.container, { backgroundColor: theme.secondary }]}>
      {/* Top bar with org name, connection status, and settings */}
      <SafeAreaView edges={["top"]} style={[styles.topBarSafe, { backgroundColor: theme.secondary }]}>
        <View style={styles.topBar}>
          <View style={styles.topBarLeft}>
            <Text style={[styles.orgName, { color: theme.primary }]} numberOfLines={1}>
              {org?.name || t("appName")}
            </Text>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: connected ? "#4ade80" : "#ef4444" }]} />
              <Text style={styles.statusText}>
                {connected ? t("connected") : t("reconnecting")}
              </Text>
              {gameState?.coinsPerSecond > 0 && (
                <Text style={[styles.statusText, { marginLeft: 8, color: "#4ade80" }]}>
                  {formatNumber(gameState.coinsPerSecond)}/sec
                </Text>
              )}
            </View>
          </View>
          {totalRaised?.totalRaisedCents > 0 && (
            <View style={styles.raisedPill}>
              <Text style={styles.raisedPillText}>
                ${(totalRaised.totalRaisedCents / 100).toFixed(2)}
              </Text>
              <Text style={styles.raisedPillLabel}>raised</Text>
            </View>
          )}
          <TouchableOpacity
            style={[styles.playerBadge, { borderColor: theme.primary + "44" }]}
            onPress={() => { Haptics.selectionAsync(); setShowProfile(true); }}
          >
            <Text style={[styles.playerBadgeText, { color: theme.primary }]}>
              {player?.name?.slice(0, 8) || "?"}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Main area: sidebar + content on wide screens, content only on phone */}
      <View style={[styles.mainArea, useSidebar && { flexDirection: "row" }]}>

      {/* Sidebar navigation (tablet/desktop) */}
      {useSidebar && (
        <View style={[styles.sidebar, { width: layout.sidebarWidth, borderRightColor: theme.primary + "22" }]}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.sidebarItem, isActive && { backgroundColor: theme.primary + "15" }]}
                onPress={() => handleTabPress(tab.key)}
              >
                {tab.iconKey ? (
                  <Image
                    source={getTabIcon(tab.iconKey)}
                    style={[styles.sidebarIconImage, !isActive && { opacity: 0.5 }]}
                  />
                ) : (
                  <Text style={styles.sidebarIcon}>{tab.icon}</Text>
                )}
                {layout.isDesktop && (
                  <Text style={[styles.sidebarLabel, isActive && { color: theme.primary }]}>
                    {tab.label}
                  </Text>
                )}
                {tab.badge > 0 && (
                  <View style={[styles.sidebarBadge, { backgroundColor: theme.accent || "#ef4444" }]}>
                    <Text style={styles.sidebarBadgeText}>{tab.badge > 99 ? "99+" : tab.badge}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Content area — full width on desktop to allow 3-column clicker layout */}
      <View style={[styles.content, useSidebar && { flex: 1 }]}>
        {showProfile ? (
          <ProfileScreen onClose={() => setShowProfile(false)} />
        ) : (
          <>
            <View style={[styles.tabContent, activeTab !== "click" && styles.tabHidden]}><ClickerScreen /></View>
            <View style={[styles.tabContent, activeTab !== "board" && styles.tabHidden]}><LeaderboardScreen /></View>
            <View style={[styles.tabContent, activeTab !== "battle" && styles.tabHidden]}><BattleScreen /></View>
            <View style={[styles.tabContent, activeTab !== "shop" && styles.tabHidden]}><ShopScreen /></View>
            <View style={[styles.tabContent, activeTab !== "skins" && styles.tabHidden]}><SkinsScreen /></View>
            <View style={[styles.tabContent, activeTab !== "chat" && styles.tabHidden]}><ChatScreen /></View>
          </>
        )}
      </View>

      </View>{/* end mainArea */}

      {/* Bottom tab bar (phone only — hidden on tablet/desktop where sidebar is used) */}
      {!useSidebar && (GlassView ? (
        <GlassView style={styles.tabBarGlass} glassEffectStyle="regular" colorScheme="dark">
          <SafeAreaView edges={["bottom"]} style={styles.tabBarGlassInner}>
            <View style={[styles.tabBar, { borderTopColor: "transparent", backgroundColor: "transparent" }]}>
              {tabs.map((tab) => {
                const isActive = activeTab === tab.key;
                return (
                  <TouchableOpacity key={tab.key} style={styles.tab} onPress={() => handleTabPress(tab.key)} activeOpacity={0.7}>
                    <View style={styles.tabInner}>
                      {tab.iconKey ? (
                        <Image source={getTabIcon(tab.iconKey)} style={[styles.tabIconImage, !isActive && { opacity: 0.5 }, isActive && { transform: [{ scale: 1.1 }] }]} />
                      ) : (
                        <Text style={[styles.tabIcon, isActive && { transform: [{ scale: 1.15 }] }]}>{tab.icon}</Text>
                      )}
                      {tab.badge > 0 && (
                        <View style={[styles.tabBadge, { backgroundColor: theme.accent || "#ef4444" }]}>
                          <Text style={styles.tabBadgeText}>{tab.badge > 99 ? "99+" : tab.badge}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.tabLabel, isActive && { color: theme.primary, fontWeight: "700" }]}>{tab.label}</Text>
                    {isActive && <View style={[styles.tabIndicator, { backgroundColor: theme.primary }]} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </SafeAreaView>
        </GlassView>
      ) : <SafeAreaView edges={["bottom"]} style={styles.tabBarSafe}>
        <View style={[styles.tabBar, { borderTopColor: theme.primary + "22" }]}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={styles.tab}
                onPress={() => handleTabPress(tab.key)}
                activeOpacity={0.7}
              >
                <View style={styles.tabInner}>
                  {tab.iconKey ? (
                    <Image
                      source={getTabIcon(tab.iconKey)}
                      style={[
                        styles.tabIconImage,
                        !isActive && { opacity: 0.5 },
                        isActive && { transform: [{ scale: 1.1 }] },
                      ]}
                    />
                  ) : (
                    <Text style={[styles.tabIcon, isActive && { transform: [{ scale: 1.15 }] }]}>
                      {tab.icon}
                    </Text>
                  )}
                  {/* Unread badge */}
                  {tab.badge > 0 && (
                    <View style={[styles.tabBadge, { backgroundColor: theme.accent || "#ef4444" }]}>
                      <Text style={styles.tabBadgeText}>
                        {tab.badge > 99 ? "99+" : tab.badge}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.tabLabel, isActive && { color: theme.primary, fontWeight: "700" }]}>
                  {tab.label}
                </Text>
                {isActive && <View style={[styles.tabIndicator, { backgroundColor: theme.primary }]} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </SafeAreaView>)}

      {/* Active game overlay (challenges, battle UIs) */}
      <ActiveGameModal />

      {/* Ban overlay (shown when autoclicker-banned) */}
      <BanOverlay />
    </View>
  );
}

// ─── MAIN SCREEN ──────────────────────────────────────────────────────────────

export default function GameScreen() {
  const { slug } = useLocalSearchParams();
  const { org, loading, selectOrg } = useOrg();
  const [loadError, setLoadError] = useState(null);

  // If org not loaded yet, load it by slug
  useEffect(() => {
    if (!org && slug && !loading) {
      selectOrg(slug).catch((e) => setLoadError(e.message));
    }
  }, [org, slug, loading, selectOrg]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FFD700" />
        <Text style={styles.loadingText}>{t("loading")}</Text>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorEmoji}>{"\uD83D\uDE15"}</Text>
        <Text style={styles.errorTitle}>{t("couldntLoadFundraiser")}</Text>
        <Text style={styles.errorDetail}>{loadError}</Text>
      </View>
    );
  }

  if (!org) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FFD700" />
      </View>
    );
  }

  return (
    <GameProvider orgSlug={slug}>
      <AuthGate orgSlug={slug}>
        <GameTabs />
      </AuthGate>
    </GameProvider>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Loading
  loadingContainer: { flex: 1, backgroundColor: "#1a1a2e", justifyContent: "center", alignItems: "center", padding: 24 },
  loadingText: { color: "#888", fontSize: 14, marginTop: 16 },
  errorEmoji: { fontSize: 48, marginBottom: 16 },
  errorTitle: { fontSize: 20, fontWeight: "700", color: "#fff", marginBottom: 8 },
  errorDetail: { fontSize: 14, color: "#888", textAlign: "center" },

  // Auth
  authContainer: { flex: 1, justifyContent: "center" },
  authContent: { padding: 32 },
  authBranding: { alignItems: "center", marginBottom: 32 },
  authCoinEmoji: { fontSize: 56, marginBottom: 12 },
  authOrgName: { fontSize: 24, fontWeight: "800", textAlign: "center" },
  authOrgDesc: { fontSize: 13, color: "#888", textAlign: "center", marginTop: 6, lineHeight: 18 },
  authTitle: { fontSize: 26, fontWeight: "800", textAlign: "center" },
  authSubtitle: { fontSize: 14, color: "#888", textAlign: "center", marginTop: 6, marginBottom: 24 },
  authErrorBox: {
    backgroundColor: "rgba(239,68,68,0.1)", borderWidth: 1, borderColor: "rgba(239,68,68,0.3)",
    borderRadius: 10, padding: 12, marginBottom: 16,
  },
  authErrorText: { color: "#ef4444", fontSize: 13, textAlign: "center", fontWeight: "500" },
  authField: { marginBottom: 18 },
  authLabel: { fontSize: 13, color: "#aaa", fontWeight: "600", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  authInput: {
    backgroundColor: "#16213e", borderRadius: 12, padding: 16,
    borderWidth: 1.5, borderColor: "#333",
    color: "#fff", fontSize: 16, fontWeight: "500",
  },
  authPinInput: { letterSpacing: 4, textAlign: "center", fontSize: 24 },
  authHint: { fontSize: 11, color: "#999", marginTop: 6 },
  authButton: { borderRadius: 14, padding: 16, alignItems: "center", marginTop: 8 },
  authButtonText: { fontSize: 17, fontWeight: "700" },
  authSwitchBtn: { padding: 12, marginTop: 8 },
  authSwitch: { color: "#888", textAlign: "center", fontSize: 14 },

  // Container
  container: { flex: 1 },

  // Top bar
  topBarSafe: {},
  topBar: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 8, gap: 10,
  },
  topBarLeft: { flex: 1 },
  orgName: { fontSize: 16, fontWeight: "800" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, color: "#888" },
  raisedPill: {
    backgroundColor: "rgba(74,222,128,0.12)", borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4, alignItems: "center",
  },
  raisedPillText: { fontSize: 14, fontWeight: "800", color: "#4ade80" },
  raisedPillLabel: { fontSize: 8, color: "#4ade80", fontWeight: "600", textTransform: "uppercase", letterSpacing: 1 },
  playerBadge: {
    borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4,
  },
  playerBadgeText: { fontSize: 11, fontWeight: "700" },

  // Main area (holds sidebar + content on wide screens)
  mainArea: { flex: 1 },

  // Sidebar (tablet/desktop)
  sidebar: {
    paddingTop: 12,
    borderRightWidth: 1,
    backgroundColor: "#0a0a14",
  },
  sidebarItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginHorizontal: 8,
    marginBottom: 2,
  },
  sidebarIcon: { fontSize: 20, width: 28, textAlign: "center" },
  sidebarIconImage: { width: 28, height: 28, borderRadius: 6 },
  sidebarLabel: { fontSize: 13, color: "#888", fontWeight: "600" },
  sidebarBadge: {
    minWidth: 18, height: 18, borderRadius: 9,
    justifyContent: "center", alignItems: "center",
    paddingHorizontal: 4, marginLeft: "auto",
  },
  sidebarBadgeText: { fontSize: 9, fontWeight: "800", color: "#fff" },

  // Content
  content: { flex: 1 },
  tabContent: { flex: 1 },
  tabHidden: { display: "none" },

  // Tab bar
  tabBarGlass: { position: "absolute", bottom: 0, left: 0, right: 0 },
  tabBarGlassInner: {},
  tabBarSafe: { backgroundColor: "#0a0a14" },
  tabBar: {
    flexDirection: "row", borderTopWidth: 1,
    paddingTop: 6, backgroundColor: "#0a0a14",
  },
  tab: { flex: 1, alignItems: "center", paddingVertical: 4, position: "relative" },
  tabInner: { position: "relative" },
  tabIcon: { fontSize: 20, textAlign: "center" },
  tabIconImage: { width: 28, height: 28, borderRadius: 6 },
  tabLabel: { fontSize: 10, color: "#aaa", marginTop: 2, fontWeight: "500" },
  tabIndicator: {
    position: "absolute", top: -7, left: "30%", right: "30%",
    height: 2, borderRadius: 1,
  },
  tabBadge: {
    position: "absolute", top: -4, right: -10,
    minWidth: 16, height: 16, borderRadius: 8,
    justifyContent: "center", alignItems: "center",
    paddingHorizontal: 4,
  },
  tabBadgeText: { fontSize: 9, fontWeight: "800", color: "#fff" },
});
