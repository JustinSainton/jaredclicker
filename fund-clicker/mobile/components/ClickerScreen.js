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
  ImageBackground,
  ScrollView,
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
  getUpgradeCost,
  purchaseUpgrade,
  createInitialState,
  ACHIEVEMENTS,
  DEFAULT_UPGRADES,
} from "../lib/gameEngine";
import { useGameState } from "../hooks/useGameState";
import { scoreStyle, headingStyle, bodyStyle, floatNumberStyle, labelStyle, glowStyle, springConfig, cardStyle } from "../lib/theme-styles";
import { getVibeAsset } from "../lib/vibe-assets";
import { useLayout } from "../hooks/useLayout";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// ─── FLOATING NUMBER COMPONENT ────────────────────────────────────────────────

function FloatingNumber({ x, y, text, onDone, theme }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 1000, useNativeDriver: true }).start(onDone);
  }, []);

  return (
    <Animated.Text
      style={[
        styles.floatingNumber,
        theme && floatNumberStyle(theme),
        {
          left: x - 30,
          top: y - 20,
          opacity: anim.interpolate({ inputRange: [0, 0.6, 1], outputRange: [1, 0.9, 0] }),
          transform: [
            { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, -140] }) },
            { scale: anim.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.8, 1.4, 1.5] }) },
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

function PhotoEventModal({ visible, bonus, onDismiss, theme, characterPhotos, onHide }) {
  const [canDismiss, setCanDismiss] = useState(false);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [charName, setCharName] = useState(null);
  const scaleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setCanDismiss(false);
      scaleAnim.setValue(0);
      Animated.spring(scaleAnim, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }).start();
      const timer = setTimeout(() => setCanDismiss(true), 1500);
      if (characterPhotos && characterPhotos.length > 0) {
        const photo = characterPhotos[Math.floor(Math.random() * characterPhotos.length)];
        setPhotoUrl(typeof photo === "string" ? photo : (photo.url || null));
        setCharName(typeof photo === "object" ? (photo.name || null) : null);
      } else {
        setPhotoUrl(null);
        setCharName(null);
      }
      return () => clearTimeout(timer);
    }
  }, [visible, characterPhotos]);

  const name = charName || "Someone";
  const messages = charName ? [
    `${name} APPEARED!`,
    `${name} is watching you!`,
    `${name} spotted in the wild!`,
    `Oh no, it's ${name}!`,
    `You can't escape ${name}!`,
    `${name} is judging your clicks!`,
    `${name} demands more clicks!`,
    `${name} has entered the chat!`,
  ] : [
    "SURPRISE APPEARANCE!",
    "A wild character appears!",
    "Someone is watching!",
    "You found them!",
    "Character spotted!",
  ];

  return (
    <Modal transparent visible={visible} animationType="fade">
      <Pressable
        style={styles.photoOverlay}
        onPress={canDismiss ? onDismiss : undefined}
      >
        <Animated.View style={[styles.photoContainer, { transform: [{ scale: scaleAnim }] }]}>
          <Text style={[styles.photoTitle, { color: theme.primary, textShadowColor: theme.glowColor || "rgba(255,215,0,0.5)" }]}>
            {messages[Math.floor(Math.random() * messages.length)]}
          </Text>
          {photoUrl ? (
            <View style={[styles.photoFrame, { borderColor: theme.primary }]}>
              <Image source={{ uri: photoUrl }} style={styles.photoImage} resizeMode="cover" />
            </View>
          ) : (
            <Text style={styles.photoEmoji}>{"\uD83D\uDE2E"}</Text>
          )}
          <Text style={[styles.photoBonus, scoreStyle(theme), { color: theme.success || "#4ade80" }]}>
            +{formatNumber(bonus)} bonus {theme.currencyName}!
          </Text>
          {onHide && (
            <Pressable style={styles.hideButton} onPress={onHide}>
              <Text style={styles.hideButtonText}>Hide for 1 Hour — $1.99</Text>
            </Pressable>
          )}
        </Animated.View>
        <Text style={styles.photoDismiss}>
          {canDismiss ? "tap anywhere to dismiss" : ""}
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

// ─── RESET COUNTDOWN ─────────────────────────────────────────────────────────

function ResetCountdown({ nextResetAt }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);
  const diff = Math.max(0, nextResetAt - now);
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  return <Text style={{ color: "#fbbf24", fontWeight: "800" }}>{days}d {hours}h {mins}m {secs}s</Text>;
}

// ─── MAIN CLICKER SCREEN ──────────────────────────────────────────────────────

// ─── DESKTOP STATS PANEL (matches jaredclicker.com left column) ──────────────

function DesktopStatsPanel({ gameState, theme, player, connected, credits }) {
  const statItems = [
    { label: "Total Coins", value: formatNumber(gameState.totalCoins || gameState.coins) },
    { label: "Per Click", value: formatNumber(gameState.coinsPerClick) },
    { label: "Per Second", value: formatNumber(gameState.coinsPerSecond) },
    { label: "Total Clicks", value: formatNumber(gameState.totalClicks) },
    { label: t("sightings"), value: String(gameState.sightings || 0) },
    { label: "Sabotage Credits", value: String((credits && player?.name ? credits[player.name.toLowerCase()] : 0) || 0) },
  ];
  const rank = getRank(gameState.totalCoins || gameState.coins);
  const rankProgress = getRankProgress(gameState.totalCoins || gameState.coins);
  return (
    <View style={dStyles.panel}>
      <Text style={dStyles.panelTitle}>Stats</Text>
      {statItems.map((s, i) => (
        <View key={i} style={dStyles.statRow}>
          <Text style={dStyles.statLabel}>{s.label}</Text>
          <Text style={dStyles.statValue}>{s.value}</Text>
        </View>
      ))}
      <View style={dStyles.smellySection}>
        <Text style={dStyles.smellyLabel}>Smelly Level</Text>
        <Text style={dStyles.smellyValue}>{rank.name}</Text>
        <View style={dStyles.smellyMeter}>
          <View style={[dStyles.smellyFill, { width: rankProgress + "%" }]} />
        </View>
      </View>
      <View style={dStyles.connRow}>
        <View style={[dStyles.connDot, { backgroundColor: connected ? "#4ade80" : "#ef4444" }]} />
        <Text style={dStyles.connText}>{connected ? t("connected") : t("reconnecting")}</Text>
      </View>
    </View>
  );
}

// ─── DESKTOP UPGRADES PANEL (matches jaredclicker.com right column) ──────────

function DesktopUpgradesPanel({ gameState, theme, onBuyUpgrade }) {
  return (
    <View style={dStyles.panel}>
      <Text style={dStyles.panelTitle}>Upgrades</Text>
      {DEFAULT_UPGRADES.map((upgrade) => {
        const owned = gameState.upgrades?.[upgrade.id] || 0;
        const cost = getUpgradeCost(upgrade, owned);
        const canAfford = gameState.coins >= cost;
        return (
          <Pressable
            key={upgrade.id}
            style={[dStyles.upgradeBtn, canAfford && dStyles.upgradeBtnAffordable, !canAfford && { opacity: 0.4 }]}
            onPress={() => canAfford && onBuyUpgrade(upgrade.id)}
            disabled={!canAfford}
          >
            <View style={dStyles.upgradeHeader}>
              <Text style={dStyles.upgradeName}>{upgrade.emoji} {upgrade.name}</Text>
              <View style={[dStyles.upgradeTag, upgrade.clickBonus > 0 ? dStyles.upgradeTagClick : dStyles.upgradeTagAuto]}>
                <Text style={dStyles.upgradeTagText}>{upgrade.clickBonus > 0 ? "CLICK" : "AUTO"}</Text>
              </View>
              {owned > 0 && (
                <View style={dStyles.ownedBadge}>
                  <Text style={dStyles.ownedBadgeText}>x{owned}</Text>
                </View>
              )}
            </View>
            <Text style={dStyles.upgradeDesc}>{upgrade.desc}</Text>
            <Text style={dStyles.upgradeCost}>Cost: {formatNumber(cost)} coins</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── DESKTOP LEADERBOARD PANEL ───────────────────────────────────────────────

function DesktopLeaderboardPanel({ theme }) {
  const { leaderboard, player } = useGame();
  const top = (leaderboard || []).slice(0, 15);
  const medals = ["\uD83E\uDD47", "\uD83E\uDD48", "\uD83E\uDD49"];
  return (
    <View style={[dStyles.panel, { marginTop: 0 }]}>
      <Text style={dStyles.panelTitle}>Leaderboard</Text>
      {top.map((entry, i) => {
        const isMe = entry.name?.toLowerCase() === player?.name?.toLowerCase();
        return (
          <View key={i} style={[dStyles.lbRow, isMe && { backgroundColor: "rgba(255,215,0,0.1)", borderRadius: 6 }]}>
            <Text style={dStyles.lbRank}>{i < 3 ? medals[i] : "#" + (i + 1)}</Text>
            <Text style={[dStyles.lbName, isMe && { color: "#ffd700", fontWeight: "800" }]} numberOfLines={1}>{entry.name}</Text>
            <Text style={dStyles.lbScore}>{formatNumber(entry.score)}</Text>
          </View>
        );
      })}
      {top.length === 0 && <Text style={dStyles.lbEmpty}>No players yet</Text>}
    </View>
  );
}

export default function ClickerScreen() {
  const { player, updateScore, scoreEpoch, sabotages, connected, totalRaised, scoreCorrection, nextResetAt, leaderboard, credits } = useGame();
  const { org, theme } = useOrg();
  const [showResetBanner, setShowResetBanner] = useState(true);
  const [showRaisedBanner, setShowRaisedBanner] = useState(true);

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
    if (photoEvent) return; // Don't process clicks while photo modal is showing

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
  }, [scaleAnim, photoEvent]);

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
  const layout = useLayout();

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  const vibeId = theme.vibeId || "retro-arcade";
  const bgSource = getVibeAsset(vibeId, "background");
  // Use org's custom coin image if set, otherwise fall back to bundled vibe coin
  const coinSource = theme.coinImageKey
    ? { uri: `https://api.fundclicker.com/orgs-assets/${theme.coinImageKey.replace("orgs/", "")}` }
    : getVibeAsset(vibeId, "coin");

  const coreContent = (
      <ScrollView contentContainerStyle={styles.scrollContent} bounces={false} showsVerticalScrollIndicator={false}>
      {/* Weekly reset countdown (dismissible) */}
      {nextResetAt && showResetBanner && (
        <Pressable style={styles.resetBanner} onPress={() => setShowResetBanner(false)}>
          <Text style={styles.resetText}>
            {"\u23F3"} Weekly Reset in <ResetCountdown nextResetAt={nextResetAt} />
          </Text>
          <Text style={styles.bannerDismiss}>{"\u2715"}</Text>
        </Pressable>
      )}

      {/* Sabotage banner */}
      <SabotageBanner state={gameState} theme={theme} />

      {/* Total raised banner (dismissible) */}
      {showRaisedBanner && totalRaised && totalRaised.totalRaisedCents > 0 && (
        <Pressable style={styles.raisedBanner} onPress={() => setShowRaisedBanner(false)}>
          <Text style={styles.raisedText}>
            {"\uD83D\uDCB0"} ${(totalRaised.totalRaisedCents / 100).toFixed(2)} raised
          </Text>
          <Text style={styles.bannerDismiss}>{"\u2715"}</Text>
        </Pressable>
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
          <Text style={[styles.rankName, { color: theme.primary }]}>{rank.name}</Text>
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
                  width: theme.coinSize,
                  height: theme.coinSize,
                  borderRadius: theme.coinSize / 2,
                  shadowColor: theme.primary,
                  shadowRadius: theme.glowRadius,
                  overflow: "hidden",
                },
                isSabotaged && { borderWidth: 3, borderColor: "#ef4444" },
              ]}
            >
              <Image
                source={coinSource}
                style={{
                  width: theme.coinSize,
                  height: theme.coinSize,
                  borderRadius: theme.coinSize / 2,
                }}
                resizeMode="cover"
              />
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
          <Text style={[styles.qsValue, { color: theme.primary }]}>{gameState.sightings}</Text>
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

      {/* Connection status — hide on desktop (shown in stats panel) */}
      {!layout.isDesktop && (
        <View style={styles.connectionBar}>
          <View style={[styles.connectionDot, { backgroundColor: connected ? "#4ade80" : "#ef4444" }]} />
          <Text style={styles.connectionText}>
            {connected ? t("connected") : t("reconnecting")}
          </Text>
        </View>
      )}

      </ScrollView>
  );

  return (
    <ImageBackground
      source={bgSource}
      style={styles.container}
      imageStyle={{ opacity: 0.4 }}
      resizeMode="cover"
    >
      {layout.isDesktop ? (
        <View style={dStyles.desktopRow}>
          <ScrollView style={dStyles.sidePanelLeft} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
            <DesktopStatsPanel gameState={gameState} theme={theme} player={player} connected={connected} credits={credits} />
          </ScrollView>
          <View style={dStyles.centerCol}>
            {coreContent}
          </View>
          <ScrollView style={dStyles.sidePanelRight} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
            <DesktopUpgradesPanel gameState={gameState} theme={theme} onBuyUpgrade={(id) => {
              setGameState((prev) => purchaseUpgrade(prev, id) || prev);
            }} />
            <DesktopLeaderboardPanel theme={theme} />
          </ScrollView>
        </View>
      ) : coreContent}

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
          onHide={() => {
            dismissPhoto();
            // TODO: wire to Stripe payment for "Hide Luke for 1 Hour — $1.99"
          }}
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
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: "space-between", paddingBottom: 80 },
  // Reset banner
  resetBanner: {
    backgroundColor: "rgba(251,191,36,0.1)", paddingVertical: 8, paddingHorizontal: 16,
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    borderBottomWidth: 1, borderBottomColor: "rgba(251,191,36,0.15)",
  },
  resetText: { fontSize: 12, fontWeight: "700", color: "#fbbf24", flex: 1, textAlign: "center" },
  bannerDismiss: { color: "#aaa", fontSize: 14, paddingLeft: 12 },
  // Total raised
  raisedBanner: {
    backgroundColor: "rgba(74,222,128,0.1)", paddingVertical: 8, paddingHorizontal: 16,
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    borderBottomWidth: 1, borderBottomColor: "rgba(74,222,128,0.2)",
  },
  raisedText: { fontSize: 13, fontWeight: "700", color: "#4ade80", flex: 1, textAlign: "center" },
  // Sabotage
  sabotageBanner: {
    paddingVertical: 8, paddingHorizontal: 16, alignItems: "center",
    shadowColor: "#ef4444", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 8,
  },
  sabotageText: { color: "#fff", fontSize: 13, fontWeight: "800", letterSpacing: 0.5 },
  // Score
  scoreSection: { alignItems: "center", paddingTop: 8 },
  score: { fontSize: 42, fontWeight: "900", fontVariant: ["tabular-nums"] },
  currencyLabel: { fontSize: 11, color: "#aaa", textTransform: "uppercase", letterSpacing: 4, marginTop: 4 },
  statsRow: { flexDirection: "row", marginTop: 8, gap: 12, alignItems: "center" },
  stat: { fontSize: 13, color: "#ccc", fontWeight: "600" },
  statSep: { fontSize: 13, color: "#555" },
  // Rank
  rankRow: { flexDirection: "row", alignItems: "center", marginTop: 10, gap: 8 },
  rankName: { fontSize: 13, fontWeight: "700" },
  rankBar: { width: 100, height: 6, backgroundColor: "#333", borderRadius: 3, overflow: "hidden" },
  rankFill: { height: "100%", borderRadius: 3 },
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
  clickHint: { color: "#aaa", fontSize: 12, marginTop: 12 },
  // Quick stats
  quickStats: { flexDirection: "row", paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  quickStat: { flex: 1, backgroundColor: "rgba(0,0,0,0.3)", borderRadius: 10, padding: 10, alignItems: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  qsLabel: { fontSize: 9, color: "#aaa", fontWeight: "700", textTransform: "uppercase", letterSpacing: 1 },
  qsValue: { fontSize: 18, fontWeight: "800", marginTop: 2 },
  // Connection
  connectionBar: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6, paddingBottom: 6, paddingTop: 4 },
  connectionDot: { width: 7, height: 7, borderRadius: 4 },
  connectionText: { fontSize: 11, color: "#aaa", fontWeight: "500" },
  // Floating numbers
  floatingNumber: {
    position: "absolute", fontWeight: "900", fontSize: 22, color: "#FFD700",
    textShadowColor: "#b8860b", textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 2,
    zIndex: 999, pointerEvents: "none",
  },
  // Photo event
  photoOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.8)", justifyContent: "center", alignItems: "center",
    paddingHorizontal: 24,
  },
  photoContainer: { alignItems: "center", width: "100%" },
  photoFrame: {
    width: SCREEN_WIDTH - 48, aspectRatio: 0.85, borderRadius: 12,
    borderWidth: 4, borderColor: "#FFD700", overflow: "hidden",
    shadowColor: "#FFD700", shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5, shadowRadius: 20, elevation: 10,
    marginVertical: 16,
  },
  photoImage: { width: "100%", height: "100%" },
  photoEmoji: { fontSize: 100, marginVertical: 20 },
  photoTitle: {
    fontSize: 26, fontWeight: "900", color: "#FFD700", textAlign: "center",
    textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 0,
    letterSpacing: 1,
  },
  photoBonus: {
    fontSize: 24, fontWeight: "900", marginTop: 4,
    textShadowColor: "rgba(0,0,0,0.5)", textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 2,
  },
  photoDismiss: { fontSize: 13, color: "#888", marginTop: 24, position: "absolute", bottom: 60 },
  hideButton: {
    marginTop: 16, paddingVertical: 14, paddingHorizontal: 32,
    borderRadius: 12, overflow: "hidden",
    backgroundColor: "#9333ea",
    shadowColor: "#9333ea", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 6,
  },
  hideButtonText: { color: "#fff", fontSize: 16, fontWeight: "800", textAlign: "center" },
  // Achievement toast
  achievementToast: {
    position: "absolute", top: 100, left: 20, right: 20,
    borderRadius: 14, padding: 16,
    flexDirection: "row", alignItems: "center", gap: 14,
    borderWidth: 2, borderColor: "#FFD700",
    shadowColor: "#FFD700", shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4, shadowRadius: 15, elevation: 12, zIndex: 1000,
    // Gradient approximation
    backgroundColor: "#2a2a4a",
  },
  achievementEmoji: { fontSize: 36 },
  achievementLabel: { fontSize: 10, color: "#4ade80", fontWeight: "800", textTransform: "uppercase", letterSpacing: 2 },
  achievementName: { fontSize: 14, color: "#fff", fontWeight: "600", marginTop: 2 },
});

// ─── DESKTOP LAYOUT STYLES (matches jaredclicker.com) ────────────────────────
const dStyles = StyleSheet.create({
  desktopRow: { flex: 1, flexDirection: "row", gap: 20, paddingHorizontal: 8 },
  sidePanelLeft: { width: 300, maxWidth: 350 },
  sidePanelRight: { width: 360, maxWidth: 420 },
  centerCol: { flex: 1 },
  // Panel base — gold bordered card like jaredclicker.com
  panel: {
    margin: 8, padding: 16, borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.5)", borderWidth: 2, borderColor: "#ffd700",
  },
  panelTitle: {
    fontSize: 24, fontWeight: "800", marginBottom: 14, textAlign: "center",
    color: "#ffd700", textShadowColor: "#b8860b", textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 0,
  },
  // Stats
  statRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "rgba(255,215,0,0.1)",
  },
  statLabel: { fontSize: 13, color: "#daa520", fontWeight: "600" },
  statValue: { fontSize: 12, fontWeight: "800", color: "#ffd700", fontVariant: ["tabular-nums"], fontFamily: "monospace" },
  // Smelly level meter (like jaredclicker.com)
  smellySection: { marginTop: 8, alignItems: "center" },
  smellyLabel: { fontSize: 11, color: "#daa520", fontWeight: "600" },
  smellyValue: { fontSize: 14, fontWeight: "800", color: "#ffd700", fontFamily: "monospace", marginTop: 2 },
  smellyMeter: {
    width: "100%", height: 18, backgroundColor: "rgba(0,0,0,0.5)",
    borderWidth: 2, borderColor: "#ffd700", borderRadius: 9, overflow: "hidden", marginTop: 6,
  },
  smellyFill: { height: "100%", borderRadius: 7, backgroundColor: "#4ade80" },
  connRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, justifyContent: "center" },
  connDot: { width: 7, height: 7, borderRadius: 4 },
  connText: { fontSize: 11, color: "#aaa" },
  // Upgrades (matches jaredclicker.com right panel)
  upgradeBtn: {
    backgroundColor: "rgba(42,42,74,0.6)", borderWidth: 2, borderColor: "#555",
    borderRadius: 12, padding: 14, marginBottom: 10,
  },
  upgradeBtnAffordable: { borderColor: "#ffd700" },
  upgradeHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  upgradeName: { fontSize: 16, fontWeight: "700", color: "#ffd700", flex: 1 },
  upgradeTag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  upgradeTagClick: { borderColor: "#ffd700", backgroundColor: "rgba(255,215,0,0.15)" },
  upgradeTagAuto: { borderColor: "#4ade80", backgroundColor: "rgba(74,222,128,0.15)" },
  upgradeTagText: { fontSize: 9, fontWeight: "800", color: "#ffd700", fontFamily: "monospace", letterSpacing: 1 },
  upgradeDesc: { fontSize: 12, color: "#aaa", marginTop: 4 },
  upgradeCost: { fontSize: 11, color: "#daa520", fontFamily: "monospace", marginTop: 6 },
  ownedBadge: {
    backgroundColor: "rgba(255,215,0,0.2)", borderWidth: 1, borderColor: "#ffd700",
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 1,
  },
  ownedBadgeText: { fontSize: 12, fontWeight: "800", color: "#ffd700" },
  // Leaderboard
  lbRow: { flexDirection: "row", alignItems: "center", paddingVertical: 5, paddingHorizontal: 4, gap: 8, borderBottomWidth: 1, borderBottomColor: "rgba(255,215,0,0.1)" },
  lbRank: { width: 28, fontSize: 11, color: "#ffd700", fontWeight: "700", textAlign: "center", fontFamily: "monospace" },
  lbName: { flex: 1, fontSize: 13, color: "#daa520", fontWeight: "600" },
  lbScore: { fontSize: 11, fontWeight: "800", color: "#ffd700", fontVariant: ["tabular-nums"], fontFamily: "monospace" },
  lbEmpty: { fontSize: 13, color: "#666", textAlign: "center", padding: 20 },
});
