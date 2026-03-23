// Core clicker game — full jaredclicker.com experience
// Floating numbers, photo events, sabotage effects, achievements, haptics
import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  Dimensions,
  Modal,
  Image,
} from "react-native";
import * as Haptics from "../lib/haptics";
import { useGame } from "../context/GameContext";
import { useOrg } from "../context/OrgContext";
import { playCoinClick, playAchievement, playPhotoEvent } from "../lib/sounds";
import t from "../lib/i18n";
import {
  handleClick,
  autoIncomeTick,
  checkAchievements,
  isClickAllowed,
  processSabotageUpdate,
  saveGameState,
  loadGameState,
  formatNumber,
  getRank,
  getRankProgress,
  createInitialState,
  ACHIEVEMENTS,
} from "../lib/gameEngine";
import { useGameState } from "../hooks/useGameState";
import { scoreStyle, headingStyle, floatNumberStyle, labelStyle, glowStyle, springConfig } from "../lib/theme-styles";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// ─── FLOATING NUMBER COMPONENT ────────────────────────────────────────────────

function FloatingNumber({ x, y, text, onDone, theme }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 800, useNativeDriver: true }).start(onDone);
  }, []);

  return (
    <Animated.Text
      style={[
        styles.floatingNumber,
        theme && floatNumberStyle(theme),
        {
          left: x - 30,
          top: y - 20,
          opacity: anim.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 0.8, 0] }),
          transform: [
            { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, -120] }) },
            { scale: anim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.8, 1.3, 1] }) },
          ],
        },
      ]}
    >
      {text}
    </Animated.Text>
  );
}

// ─── ACHIEVEMENT TOAST ────────────────────────────────────────────────────────

function AchievementToast({ achievement, onDone }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(anim, { toValue: 1, friction: 5, useNativeDriver: true }),
      Animated.delay(2000),
      Animated.timing(anim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(onDone);
  }, []);

  return (
    <Animated.View
      style={[
        styles.achievementToast,
        {
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-60, 0] }) }],
        },
      ]}
    >
      <Text style={styles.achievementEmoji}>{"\uD83C\uDFC6"}</Text>
      <View>
        <Text style={styles.achievementLabel}>{t("achievementUnlocked")}</Text>
        <Text style={styles.achievementName}>{achievement.name}</Text>
      </View>
    </Animated.View>
  );
}

// ─── PHOTO EVENT MODAL ────────────────────────────────────────────────────────

function PhotoEventModal({ visible, bonus, onDismiss, theme, characterPhotos }) {
  const [canDismiss, setCanDismiss] = useState(false);
  const [photoUrl, setPhotoUrl] = useState(null);

  useEffect(() => {
    if (visible) {
      setCanDismiss(false);
      const timer = setTimeout(() => setCanDismiss(true), 1500);
      // Pick a random character photo if org has them
      if (characterPhotos && characterPhotos.length > 0) {
        const photo = characterPhotos[Math.floor(Math.random() * characterPhotos.length)];
        setPhotoUrl(typeof photo === "string" ? photo : photo.url);
      } else {
        setPhotoUrl(null);
      }
      return () => clearTimeout(timer);
    }
  }, [visible, characterPhotos]);

  const messages = [
    t("characterAppeared"),
    "A WILD CHARACTER APPEARS!",
    "SURPRISE APPEARANCE!",
    "YOU FOUND THEM!",
    "CHARACTER IS WATCHING!",
  ];

  return (
    <Modal transparent visible={visible} animationType="fade">
        <Pressable
        style={styles.photoOverlay}
        onPress={canDismiss ? onDismiss : undefined}
      >
        {photoUrl ? (
          <Image source={{ uri: photoUrl }} style={styles.photoImage} resizeMode="contain" />
        ) : (
          <Text style={styles.photoEmoji}>{"\uD83D\uDE2E"}</Text>
        )}
        <Text style={styles.photoTitle}>
          {messages[Math.floor(Math.random() * messages.length)]}
        </Text>
        <Text style={[styles.photoBonus, { color: theme.primary }]}>
          +{formatNumber(bonus)} {theme.currencyName}!
        </Text>
        <Text style={styles.photoDismiss}>
          {canDismiss ? t("tapToDismiss") : t("admireForAMoment")}
        </Text>
      </Pressable>
    </Modal>
  );
}

// ─── SABOTAGE BANNER ──────────────────────────────────────────────────────────

function SabotageBanner({ state, theme }) {
  if (!state.sabotageEndAt || state.sabotageEndAt <= Date.now()) return null;

  const remaining = Math.max(0, Math.ceil((state.sabotageEndAt - Date.now()) / 60000));
  const isFrozen = state.sabotageMultiplier === 0;

  return (
    <View style={[styles.sabotageBanner, { backgroundColor: isFrozen ? "#3b82f6" : "#ef4444" }]}>
      <Text style={styles.sabotageText}>
        {isFrozen ? "\u2744\uFE0F FROZEN" : "\uD83D\uDCA3 SABOTAGED"} — {isFrozen ? "0x" : "0.5x"} speed — {remaining}m left
      </Text>
    </View>
  );
}

// ─── MAIN CLICKER SCREEN ──────────────────────────────────────────────────────

export default function ClickerScreen() {
  const { player, updateScore, scoreEpoch, sabotages, connected, totalRaised, scoreCorrection } = useGame();
  const { org, theme } = useOrg();

  // Shared game state (synced with ShopScreen and other tabs)
  const { gameState, setGameState } = useGameState();
  const [floaters, setFloaters] = useState([]);
  const [photoEvent, setPhotoEvent] = useState(null);
  const [achievementQueue, setAchievementQueue] = useState([]);
  const [loaded, setLoaded] = useState(false);

  // Coin animation
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const floaterIdRef = useRef(0);
  const saveTimer = useRef(null);
  const syncTimer = useRef(null);

  // Glow pulse animation
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 2000, useNativeDriver: false }),
        Animated.timing(glowAnim, { toValue: 0, duration: 2000, useNativeDriver: false }),
      ])
    ).start();
  }, []);

  // Mark loaded once useGameState has initialized
  // (useGameState handles loading from AsyncStorage, auto-income, and auto-save)
  useEffect(() => {
    if (gameState && gameState.coins !== undefined) {
      if (!loaded) {
        setLoaded(true);
        // Show offline earnings notification
        if (gameState._offlineEarnings > 0) {
          setAchievementQueue((q) => [...q, {
            id: "offline",
            name: `+${formatNumber(gameState._offlineEarnings)} offline earnings (${gameState._offlineSeconds}s)`,
          }]);
        }
      }
    }
  }, [gameState, loaded]);

  // Sync full game state to server every 5s (score + stats + upgrades + gameState for cross-device)
  useEffect(() => {
    if (!loaded || !player?.name) return;
    const interval = setInterval(() => {
      updateScore(gameState.coins, {
        coinsPerClick: gameState.coinsPerClick,
        coinsPerSecond: gameState.coinsPerSecond,
        totalClicks: gameState.totalClicks,
        gameState: {
          coins: gameState.coins,
          upgrades: gameState.upgrades,
          achievements: gameState.achievements,
          coinsPerClick: gameState.coinsPerClick,
          coinsPerSecond: gameState.coinsPerSecond,
          totalClicks: gameState.totalClicks,
          totalCoins: gameState.totalCoins,
          sightings: gameState.sightings,
        },
        authToken: player?.token,
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [loaded, player?.name, player?.token, gameState.coins, gameState.coinsPerClick, gameState.coinsPerSecond, updateScore]);

  // Process sabotages from server
  useEffect(() => {
    if (player?.name && sabotages?.length >= 0) {
      setGameState((prev) => processSabotageUpdate(prev, sabotages, player.name));
    }
  }, [sabotages, player?.name]);

  // Apply score corrections from server immediately (battles, coin cuts, admin actions)
  useEffect(() => {
    if (!scoreCorrection || !player?.name) return;
    if (scoreCorrection.targetName?.toLowerCase() !== player.name.toLowerCase()) return;
    setGameState((prev) => ({
      ...prev,
      coins: scoreCorrection.newScore,
    }));
    // Show floating number for the delta
    if (scoreCorrection.delta !== 0) {
      const id = ++floaterIdRef.current;
      const sign = scoreCorrection.delta > 0 ? "+" : "";
      setFloaters((f) => [...f, {
        id,
        x: SCREEN_WIDTH / 2,
        y: 100,
        text: sign + formatNumber(scoreCorrection.delta),
      }]);
    }
  }, [scoreCorrection, player?.name]);

  // Click handler
  const handlePress = useCallback((evt) => {
    if (!isClickAllowed()) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    playCoinClick();

    // Get press position
    const { pageX, pageY } = evt.nativeEvent;

    setGameState((prev) => {
      const result = handleClick(prev);

      // Spawn floating number
      const id = ++floaterIdRef.current;
      setFloaters((f) => [...f, { id, x: pageX, y: pageY, text: "+" + formatNumber(result.earned) }]);

      // Photo event
      if (result.photoEvent) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        playPhotoEvent();
        setPhotoEvent(result.photoEvent);
      }

      // Check achievements
      const achResult = checkAchievements(result.state);
      if (achResult.newAchievements.length > 0) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        playAchievement();
        setAchievementQueue((q) => [...q, ...achResult.newAchievements]);
      }

      return achResult.state;
    });

    // Bounce (uses vibe-specific spring physics)
    const spring = springConfig(theme);
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.88, duration: theme.animation?.coinPressDuration || 40, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: spring.friction, tension: spring.tension, useNativeDriver: true }),
    ]).start();
  }, [scaleAnim]);

  // Remove floater
  const removeFloater = useCallback((id) => {
    setFloaters((f) => f.filter((fl) => fl.id !== id));
  }, []);

  // Dismiss photo event
  const dismissPhoto = useCallback(() => {
    setPhotoEvent(null);
  }, []);

  // Dismiss achievement
  const dismissAchievement = useCallback(() => {
    setAchievementQueue((q) => q.slice(1));
  }, []);

  const rank = useMemo(() => getRank(gameState.totalCoins), [gameState.totalCoins]);
  const rankProgress = useMemo(() => getRankProgress(gameState.totalCoins), [gameState.totalCoins]);
  const isSabotaged = gameState.sabotageEndAt > Date.now();

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  return (
    <View style={styles.container}>
      {/* Sabotage banner */}
      <SabotageBanner state={gameState} theme={theme} />

      {/* Total raised banner */}
      {totalRaised && totalRaised.totalRaisedCents > 0 && (
        <View style={styles.raisedBanner}>
          <Text style={styles.raisedText}>
            {"\uD83D\uDCB0"} ${(totalRaised.totalRaisedCents / 100).toFixed(2)} raised
            {totalRaised.transactionCount > 0 ? ` (${totalRaised.transactionCount} donations)` : ""}
          </Text>
        </View>
      )}

      {/* Score display */}
      <View style={styles.scoreSection}>
        <Text style={[
          styles.score,
          scoreStyle(theme),
          { color: theme.primary },
        ]}>
          {formatNumber(gameState.coins)}
        </Text>
        <Text style={[styles.currencyLabel, labelStyle(theme)]}>{theme.currencyName}</Text>
        <View style={styles.statsRow}>
          <Text style={styles.stat}>
            {formatNumber(gameState.coinsPerClick)}/tap
            {isSabotaged ? " (x" + gameState.sabotageMultiplier + ")" : ""}
          </Text>
          <Text style={styles.statSep}>|</Text>
          <Text style={styles.stat}>{formatNumber(gameState.coinsPerSecond)}/sec</Text>
        </View>
        {/* Rank */}
        <View style={styles.rankRow}>
          <Text style={styles.rankName}>{rank.name}</Text>
          <View style={styles.rankBar}>
            <View style={[styles.rankFill, { width: rankProgress + "%", backgroundColor: theme.primary }]} />
          </View>
        </View>
      </View>

      {/* Coin button */}
      <View style={styles.coinSection}>
        <Pressable onPressIn={handlePress}>
          <Animated.View style={[styles.coinOuter, { transform: [{ scale: scaleAnim }] }]}>
            {/* Glow ring */}
            <Animated.View
              style={[
                styles.coinGlow,
                {
                  borderColor: theme.primary,
                  opacity: glowOpacity,
                  shadowColor: theme.primary,
                  width: theme.coinSize + 40,
                  height: theme.coinSize + 40,
                  borderRadius: (theme.coinSize + 40) / 2,
                  shadowRadius: theme.glowRadius,
                  borderWidth: theme.borderWidth,
                },
              ]}
            />
            <View
              style={[
                styles.coinButton,
                {
                  backgroundColor: theme.primary,
                  width: theme.coinSize,
                  height: theme.coinSize,
                  borderRadius: theme.coinSize / 2,
                  shadowColor: theme.primary,
                  shadowRadius: theme.glowRadius,
                },
                isSabotaged && { backgroundColor: "#ef4444" },
              ]}
            >
              <Text style={[styles.coinEmoji, { fontSize: theme.coinSize * 0.45 }]}>{theme.coinEmoji}</Text>
            </View>
          </Animated.View>
        </Pressable>
        <Text style={styles.clickHint}>
          {gameState.totalClicks === 0 ? t("tapToStart") : formatNumber(gameState.totalClicks) + " " + t("taps")}
        </Text>
      </View>

      {/* Quick stats bar */}
      <View style={styles.quickStats}>
        <View style={styles.quickStat}>
          <Text style={styles.qsLabel}>{t("sightings")}</Text>
          <Text style={[styles.qsValue, scoreStyle(theme), { color: theme.primary }]}>{gameState.sightings}</Text>
        </View>
        <View style={styles.quickStat}>
          <Text style={styles.qsLabel}>{t("upgrades")}</Text>
          <Text style={[styles.qsValue, { color: theme.primary }]}>
            {Object.values(gameState.upgrades).reduce((a, b) => a + b, 0)}
          </Text>
        </View>
        <View style={styles.quickStat}>
          <Text style={styles.qsLabel}>{t("achievements")}</Text>
          <Text style={[styles.qsValue, { color: theme.primary }]}>
            {gameState.achievements.length}/{ACHIEVEMENTS.length}
          </Text>
        </View>
      </View>

      {/* Connection status */}
      <View style={styles.connectionBar}>
        <View style={[styles.connectionDot, { backgroundColor: connected ? "#4ade80" : "#ef4444" }]} />
        <Text style={styles.connectionText}>
          {connected ? t("connected") : t("reconnecting")}
        </Text>
      </View>

      {/* Floating numbers */}
      {floaters.map((f) => (
        <FloatingNumber key={f.id} x={f.x} y={f.y} text={f.text} theme={theme} onDone={() => removeFloater(f.id)} />
      ))}

      {/* Photo event modal */}
      {photoEvent && (
        <PhotoEventModal
          visible={true}
          bonus={photoEvent.bonus}
          onDismiss={dismissPhoto}
          theme={theme}
          characterPhotos={theme.characterPhotos}
        />
      )}

      {/* Achievement toast */}
      {achievementQueue.length > 0 && (
        <AchievementToast
          key={achievementQueue[0].id}
          achievement={achievementQueue[0]}
          onDone={dismissAchievement}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "space-between" },
  // Total raised
  raisedBanner: {
    backgroundColor: "rgba(74,222,128,0.1)", paddingVertical: 6, paddingHorizontal: 16,
    alignItems: "center", borderBottomWidth: 1, borderBottomColor: "rgba(74,222,128,0.2)",
  },
  raisedText: { fontSize: 12, fontWeight: "700", color: "#4ade80" },
  // Sabotage
  sabotageBanner: {
    paddingVertical: 6, paddingHorizontal: 16, alignItems: "center",
  },
  sabotageText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  // Score
  scoreSection: { alignItems: "center", paddingTop: 8 },
  score: { fontSize: 44, fontWeight: "900", fontVariant: ["tabular-nums"] },
  currencyLabel: { fontSize: 14, color: "#888", textTransform: "uppercase", letterSpacing: 3, marginTop: 2 },
  statsRow: { flexDirection: "row", marginTop: 6, gap: 12, alignItems: "center" },
  stat: { fontSize: 13, color: "#aaa", fontWeight: "500" },
  statSep: { fontSize: 13, color: "#444" },
  // Rank
  rankRow: { flexDirection: "row", alignItems: "center", marginTop: 8, gap: 8 },
  rankName: { fontSize: 12, color: "#FFD700", fontWeight: "700" },
  rankBar: { width: 80, height: 4, backgroundColor: "#333", borderRadius: 2, overflow: "hidden" },
  rankFill: { height: "100%", borderRadius: 2 },
  // Coin
  coinSection: { alignItems: "center", justifyContent: "center", flex: 1 },
  coinOuter: { alignItems: "center", justifyContent: "center" },
  coinGlow: {
    position: "absolute", width: 200, height: 200, borderRadius: 100,
    borderWidth: 3, shadowOffset: { width: 0, height: 0 }, shadowRadius: 30, elevation: 10,
  },
  coinButton: {
    width: 160, height: 160, borderRadius: 80,
    justifyContent: "center", alignItems: "center",
    shadowColor: "#FFD700", shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5, shadowRadius: 20, elevation: 10,
  },
  coinEmoji: { fontSize: 72 },
  clickHint: { color: "#666", fontSize: 12, marginTop: 12 },
  // Quick stats
  quickStats: { flexDirection: "row", paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  quickStat: { flex: 1, backgroundColor: "#16213e", borderRadius: 10, padding: 10, alignItems: "center" },
  qsLabel: { fontSize: 10, color: "#888", fontWeight: "600", textTransform: "uppercase" },
  qsValue: { fontSize: 18, fontWeight: "800", marginTop: 2 },
  // Connection
  connectionBar: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6, paddingBottom: 4 },
  connectionDot: { width: 6, height: 6, borderRadius: 3 },
  connectionText: { fontSize: 10, color: "#666" },
  // Floating numbers
  floatingNumber: {
    position: "absolute", fontWeight: "900", fontSize: 22, color: "#FFD700",
    textShadowColor: "#b8860b", textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 2,
    zIndex: 999, pointerEvents: "none",
  },
  // Photo event
  photoOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "center", alignItems: "center",
  },
  photoImage: { width: 200, height: 200, borderRadius: 20, marginBottom: 20 },
  photoEmoji: { fontSize: 100, marginBottom: 20 },
  photoTitle: { fontSize: 24, fontWeight: "900", color: "#fff", textAlign: "center" },
  photoBonus: { fontSize: 28, fontWeight: "900", marginTop: 12 },
  photoDismiss: { fontSize: 14, color: "#888", marginTop: 24 },
  // Achievement toast
  achievementToast: {
    position: "absolute", top: 100, left: 20, right: 20,
    backgroundColor: "#16213e", borderRadius: 12, padding: 14,
    flexDirection: "row", alignItems: "center", gap: 12,
    borderWidth: 1, borderColor: "#FFD700",
    shadowColor: "#FFD700", shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3, shadowRadius: 10, elevation: 10, zIndex: 1000,
  },
  achievementEmoji: { fontSize: 32 },
  achievementLabel: { fontSize: 11, color: "#FFD700", fontWeight: "700" },
  achievementName: { fontSize: 14, color: "#fff", fontWeight: "600", marginTop: 2 },
});
