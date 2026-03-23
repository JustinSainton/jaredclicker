// Player Profile — stats, achievements, rank progression, credits balance
// Accessible from the top bar player badge tap
import React, { useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { useGame } from "../context/GameContext";
import { useOrg } from "../context/OrgContext";
import { useGameState } from "../hooks/useGameState";
import {
  formatNumber,
  getRank,
  getRankProgress,
  RANK_LEVELS,
  ACHIEVEMENTS,
} from "../lib/gameEngine";
import t from "../lib/i18n";

export default function ProfileScreen({ onClose }) {
  const { player, credits, leaderboard, online } = useGame();
  const { theme } = useOrg();
  const { gameState } = useGameState();

  const rank = useMemo(() => getRank(gameState.totalCoins), [gameState.totalCoins]);
  const rankProgress = useMemo(() => getRankProgress(gameState.totalCoins), [gameState.totalCoins]);
  const nextRank = useMemo(() => {
    const idx = RANK_LEVELS.indexOf(rank);
    return idx < RANK_LEVELS.length - 1 ? RANK_LEVELS[idx + 1] : null;
  }, [rank]);

  const myCredits = credits?.[player?.name?.toLowerCase()] || 0;

  // Find player's rank on leaderboard
  const leaderboardRank = useMemo(() => {
    const idx = leaderboard.findIndex(
      e => e.name.toLowerCase() === player?.name?.toLowerCase()
    );
    return idx >= 0 ? idx + 1 : null;
  }, [leaderboard, player?.name]);

  const earnedAchievements = gameState.achievements || [];
  const totalAchievements = ACHIEVEMENTS.length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={styles.header}>{t("profile")}</Text>
        {onClose && (
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>{"\u2715"}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Player identity */}
      <View style={styles.identityCard}>
        <View style={[styles.avatar, { backgroundColor: theme.primary + "22", borderColor: theme.primary }]}>
          <Text style={styles.avatarText}>
            {player?.name?.charAt(0)?.toUpperCase() || "?"}
          </Text>
        </View>
        <Text style={[styles.playerName, { color: theme.primary }]}>{player?.name || t("playerDefaultName")}</Text>
        <Text style={styles.rankName}>{rank.name}</Text>
        {online?.includes(player?.name) && (
          <View style={styles.onlineIndicator}>
            <View style={styles.onlineDot} />
            <Text style={styles.onlineLabel}>{t("online")}</Text>
          </View>
        )}
      </View>

      {/* Rank progress */}
      <View style={styles.rankCard}>
        <View style={styles.rankHeader}>
          <Text style={styles.rankTitle}>{t("rankProgress")}</Text>
          <Text style={[styles.rankPercent, { color: theme.primary }]}>{Math.round(rankProgress)}%</Text>
        </View>
        <View style={styles.rankBar}>
          <View style={[styles.rankFill, { width: rankProgress + "%", backgroundColor: theme.primary }]} />
        </View>
        {nextRank && (
          <Text style={styles.rankNext}>
            {t("nextRank", { name: nextRank.name, amount: formatNumber(nextRank.threshold), currency: theme.currencyName })}
          </Text>
        )}
      </View>

      {/* Stats grid */}
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statEmoji}>{"\uD83E\uDE99"}</Text>
          <Text style={[styles.statValue, { color: theme.primary }]}>{formatNumber(gameState.coins)}</Text>
          <Text style={styles.statLabel}>{t("current")}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statEmoji}>{"\uD83D\uDCB0"}</Text>
          <Text style={[styles.statValue, { color: theme.primary }]}>{formatNumber(gameState.totalCoins)}</Text>
          <Text style={styles.statLabel}>{t("allTime")}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statEmoji}>{"\uD83D\uDC46"}</Text>
          <Text style={[styles.statValue, { color: theme.primary }]}>{formatNumber(gameState.totalClicks)}</Text>
          <Text style={styles.statLabel}>{t("taps")}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statEmoji}>{"\uD83D\uDC40"}</Text>
          <Text style={[styles.statValue, { color: theme.primary }]}>{gameState.sightings}</Text>
          <Text style={styles.statLabel}>{t("sightings")}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statEmoji}>{"\u2B06\uFE0F"}</Text>
          <Text style={[styles.statValue, { color: theme.primary }]}>
            {Object.values(gameState.upgrades).reduce((a, b) => a + b, 0)}
          </Text>
          <Text style={styles.statLabel}>{t("upgrades")}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statEmoji}>{"\uD83C\uDFC6"}</Text>
          <Text style={[styles.statValue, { color: theme.primary }]}>
            {leaderboardRank ? `#${leaderboardRank}` : "--"}
          </Text>
          <Text style={styles.statLabel}>{t("rankLabel")}</Text>
        </View>
      </View>

      {/* Per-tap and per-sec stats */}
      <View style={styles.ratesCard}>
        <View style={styles.rateRow}>
          <Text style={styles.rateLabel}>{theme.currencyName}{t("perTap")}</Text>
          <Text style={[styles.rateValue, { color: "#60a5fa" }]}>{formatNumber(gameState.coinsPerClick)}</Text>
        </View>
        <View style={[styles.rateDivider, { backgroundColor: theme.primary + "22" }]} />
        <View style={styles.rateRow}>
          <Text style={styles.rateLabel}>{theme.currencyName}{t("perSec")}</Text>
          <Text style={[styles.rateValue, { color: "#4ade80" }]}>{formatNumber(gameState.coinsPerSecond)}</Text>
        </View>
      </View>

      {/* Sabotage credits */}
      <View style={styles.creditsCard}>
        <View style={styles.creditsRow}>
          <Text style={styles.creditsEmoji}>{"\uD83D\uDCA3"}</Text>
          <View>
            <Text style={styles.creditsTitle}>{t("sabotageCreditsTitle")}</Text>
            <Text style={styles.creditsDesc}>{t("useToSlowDown")}</Text>
          </View>
        </View>
        <Text style={[styles.creditsCount, { color: theme.accent || "#e94560" }]}>
          {myCredits}
        </Text>
      </View>

      {/* Achievements */}
      <Text style={[styles.sectionTitle, { marginTop: 24 }]}>
        {t("achievementsCount", { earned: earnedAchievements.length, total: totalAchievements })}
      </Text>
      <View style={styles.achievementGrid}>
        {ACHIEVEMENTS.map((ach) => {
          const earned = earnedAchievements.includes(ach.id);
          return (
            <View
              key={ach.id}
              style={[
                styles.achievementItem,
                earned && { borderColor: theme.primary + "55", backgroundColor: theme.primary + "0D" },
              ]}
            >
              <Text style={[styles.achievementIcon, !earned && { opacity: 0.3 }]}>
                {earned ? "\uD83C\uDFC6" : "\uD83D\uDD12"}
              </Text>
              <Text style={[styles.achievementName, !earned && { color: "#999" }]}>
                {ach.name}
              </Text>
              {earned && <Text style={[styles.achievementCheck, { color: theme.primary }]}>{"\u2713"}</Text>}
            </View>
          );
        })}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  header: { fontSize: 24, fontWeight: "800", color: "#fff" },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.08)", justifyContent: "center", alignItems: "center" },
  closeBtnText: { fontSize: 16, color: "#aaa" },

  // Identity
  identityCard: { alignItems: "center", marginBottom: 24 },
  avatar: {
    width: 72, height: 72, borderRadius: 36, borderWidth: 2,
    justifyContent: "center", alignItems: "center", marginBottom: 12,
  },
  avatarText: { fontSize: 28, fontWeight: "900", color: "#fff" },
  playerName: { fontSize: 22, fontWeight: "800" },
  rankName: { fontSize: 14, color: "#888", marginTop: 4, fontWeight: "500" },
  onlineIndicator: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#4ade80" },
  onlineLabel: { fontSize: 11, color: "#4ade80" },

  // Rank progress
  rankCard: { backgroundColor: "#16213e", borderRadius: 14, padding: 16, marginBottom: 16 },
  rankHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  rankTitle: { fontSize: 14, fontWeight: "600", color: "#ccc" },
  rankPercent: { fontSize: 14, fontWeight: "700" },
  rankBar: { height: 8, backgroundColor: "#222", borderRadius: 4, overflow: "hidden" },
  rankFill: { height: "100%", borderRadius: 4 },
  rankNext: { fontSize: 11, color: "#aaa", marginTop: 8 },

  // Stats grid
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  statCard: {
    width: "31%", backgroundColor: "#16213e", borderRadius: 12,
    padding: 12, alignItems: "center",
  },
  statEmoji: { fontSize: 20, marginBottom: 4 },
  statValue: { fontSize: 16, fontWeight: "800" },
  statLabel: { fontSize: 10, color: "#888", marginTop: 2, textTransform: "uppercase" },

  // Rates
  ratesCard: {
    flexDirection: "row", backgroundColor: "#16213e", borderRadius: 14,
    padding: 16, marginBottom: 16,
  },
  rateRow: { flex: 1, alignItems: "center" },
  rateLabel: { fontSize: 12, color: "#888", marginBottom: 4 },
  rateValue: { fontSize: 22, fontWeight: "800" },
  rateDivider: { width: 1, marginHorizontal: 12 },

  // Credits
  creditsCard: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: "#16213e", borderRadius: 14, padding: 16,
  },
  creditsRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  creditsEmoji: { fontSize: 28 },
  creditsTitle: { fontSize: 15, fontWeight: "600", color: "#fff" },
  creditsDesc: { fontSize: 11, color: "#888", marginTop: 2 },
  creditsCount: { fontSize: 28, fontWeight: "900" },

  // Achievements
  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#fff", marginBottom: 12 },
  achievementGrid: { gap: 6 },
  achievementItem: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#16213e", borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: "#1e2a45",
  },
  achievementIcon: { fontSize: 18 },
  achievementName: { flex: 1, fontSize: 13, color: "#ccc", fontWeight: "500" },
  achievementCheck: { fontSize: 14, fontWeight: "800" },
});
