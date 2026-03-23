// Leaderboard — production-grade real-time rankings
// Features: top 50 from WebSocket, player's own rank (even if not in top 50),
// tab toggle between Weekly and Hall of Fame, online indicators, i18n
import React, { useState, useMemo } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from "react-native";
import * as Haptics from "../lib/haptics";
import { useGame } from "../context/GameContext";
import { useOrg } from "../context/OrgContext";
import { useGameState } from "../hooks/useGameState";
import { formatNumber } from "../lib/gameEngine";
import { headingStyle, scoreStyle, cardBorderStyle } from "../lib/theme-styles";
import t from "../lib/i18n";

export default function LeaderboardScreen() {
  const { leaderboard, online, player, hallOfFame } = useGame();
  const { theme } = useOrg();
  const { gameState } = useGameState();
  const [tab, setTab] = useState("weekly"); // "weekly" | "hof"

  // Find player's position
  const myRank = useMemo(() => {
    const idx = leaderboard.findIndex(
      e => e.name.toLowerCase() === player?.name?.toLowerCase()
    );
    return idx >= 0 ? idx + 1 : null;
  }, [leaderboard, player?.name]);

  // If player isn't in top 50, show them at the bottom
  const myEntry = useMemo(() => {
    if (myRank) return null; // Already in the list
    if (!player?.name || !gameState?.coins) return null;
    return {
      name: player.name,
      score: gameState.coins,
      stats: { coinsPerSecond: gameState.coinsPerSecond },
      _isOutOfRange: true,
    };
  }, [myRank, player?.name, gameState?.coins, gameState?.coinsPerSecond]);

  const renderItem = ({ item, index }) => {
    const isMe = player?.name?.toLowerCase() === item.name.toLowerCase();
    const isOutOfRange = item._isOutOfRange;
    const rank = isOutOfRange ? "50+" : index + 1;
    const medals = ["\uD83E\uDD47", "\uD83E\uDD48", "\uD83E\uDD49"];
    const medal = !isOutOfRange && index < 3 ? medals[index] : null;
    const isOnline = online.includes(item.name);

    return (
      <View style={[
        styles.row,
        isMe && { backgroundColor: theme.primary + "15", borderColor: theme.primary + "44" },
        isOutOfRange && styles.rowOutOfRange,
      ]}>
        <View style={styles.rank}>
          {medal ? (
            <Text style={styles.medal}>{medal}</Text>
          ) : (
            <Text style={[styles.rankNum, isMe && { color: theme.primary }]}>{rank}</Text>
          )}
        </View>
        <View style={styles.playerInfo}>
          <View style={styles.nameRow}>
            <Text style={[styles.name, isMe && { color: theme.primary }]}>
              {item.name}
            </Text>
            {isOnline && <View style={styles.onlineDot} />}
            {isMe && <Text style={styles.youBadge}>{t("profile")}</Text>}
          </View>
          {item.stats?.coinsPerSecond > 0 && (
            <Text style={styles.subtitle}>
              {formatNumber(item.stats.coinsPerSecond)}{t("perSec")}
            </Text>
          )}
        </View>
        <Text style={[styles.score, scoreStyle(theme), isMe && { color: theme.primary }]}>
          {formatNumber(item.score)}
        </Text>
      </View>
    );
  };

  const renderHofItem = ({ item: week }) => (
    <View style={styles.hofRow}>
      <View style={styles.hofLeft}>
        <Text style={styles.hofWeek}>{t("week")} {week.week}</Text>
        <Text style={styles.hofDate}>{week.date}</Text>
      </View>
      <View style={styles.hofRight}>
        <Text style={[styles.hofChampion, { color: theme.primary }]}>
          {"\uD83C\uDFC6"} {week.champion}
        </Text>
        <Text style={styles.hofScore}>{formatNumber(week.championScore)}</Text>
      </View>
      {/* Top 3 mini-podium */}
      {week.top10?.slice(0, 3).map((entry, i) => (
        <View key={i} style={styles.hofEntry}>
          <Text style={styles.hofEntryRank}>{["\uD83E\uDD47", "\uD83E\uDD48", "\uD83E\uDD49"][i]}</Text>
          <Text style={styles.hofEntryName}>{entry.name}</Text>
          <Text style={styles.hofEntryScore}>{formatNumber(entry.score)}</Text>
        </View>
      ))}
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Tab toggle */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === "weekly" && { borderBottomColor: theme.primary, borderBottomWidth: 2 }]}
          onPress={() => { Haptics.selectionAsync(); setTab("weekly"); }}
        >
          <Text style={[styles.tabText, tab === "weekly" && { color: theme.primary }]}>
            {t("leaderboard")}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === "hof" && { borderBottomColor: theme.primary, borderBottomWidth: 2 }]}
          onPress={() => { Haptics.selectionAsync(); setTab("hof"); }}
        >
          <Text style={[styles.tabText, tab === "hof" && { color: theme.primary }]}>
            {"\uD83C\uDFC6"} {t("hallOfFame")}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Header stats */}
      <View style={styles.headerStats}>
        <Text style={styles.onlineCount}>
          <Text style={{ color: "#4ade80" }}>{"\u25CF"}</Text> {online?.length || 0} {t("online")}
        </Text>
        {myRank && (
          <Text style={[styles.myRank, { color: theme.primary }]}>
            Your rank: #{myRank}
          </Text>
        )}
      </View>

      {tab === "weekly" ? (
        <FlatList
          data={myEntry ? [...leaderboard, myEntry] : leaderboard}
          keyExtractor={(item, i) => item._isOutOfRange ? "me" : item.name.toLowerCase()}
          renderItem={renderItem}
          style={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyEmoji}>{"\uD83C\uDFC6"}</Text>
              <Text style={styles.emptyText}>{t("noScoresYet")}</Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={[...(hallOfFame || [])].reverse()}
          keyExtractor={(item) => String(item.week)}
          renderItem={renderHofItem}
          style={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyEmoji}>{"\uD83C\uDFC6"}</Text>
              <Text style={styles.emptyText}>{t("noHallOfFame")}</Text>
              <Text style={styles.emptyHint}>{t("completeWeeklyReset")}</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Tabs
  tabRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#222" },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: "center" },
  tabText: { fontSize: 14, fontWeight: "600", color: "#888" },

  // Header
  headerStats: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 8 },
  onlineCount: { fontSize: 13, color: "#888" },
  myRank: { fontSize: 13, fontWeight: "700" },

  // List
  list: { flex: 1, paddingHorizontal: 16 },
  row: {
    flexDirection: "row", alignItems: "center", padding: 12,
    backgroundColor: "#16213e", borderRadius: 10, marginBottom: 5,
    borderWidth: 1, borderColor: "transparent",
  },
  rowOutOfRange: {
    marginTop: 8, borderTopWidth: 1, borderTopColor: "#333",
    borderStyle: "dashed",
  },
  rank: { width: 36, alignItems: "center" },
  medal: { fontSize: 20 },
  rankNum: { fontSize: 15, color: "#888", fontWeight: "700" },
  playerInfo: { flex: 1, marginLeft: 8 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { fontSize: 15, color: "#fff", fontWeight: "600" },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#4ade80" },
  youBadge: { fontSize: 10, color: "#888", backgroundColor: "#333", paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, fontWeight: "600" },
  subtitle: { fontSize: 12, color: "#888", marginTop: 2 },
  score: { fontSize: 15, color: "#ccc", fontWeight: "800", fontVariant: ["tabular-nums"] },

  // Empty
  emptyWrap: { alignItems: "center", paddingTop: 60 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, color: "#666", fontWeight: "600" },
  emptyHint: { fontSize: 13, color: "#444", marginTop: 4, textAlign: "center" },

  // Hall of Fame
  hofRow: {
    backgroundColor: "#16213e", borderRadius: 14, padding: 16, marginBottom: 10,
  },
  hofLeft: { marginBottom: 8 },
  hofWeek: { fontSize: 13, fontWeight: "700", color: "#aaa" },
  hofDate: { fontSize: 11, color: "#666", marginTop: 2 },
  hofRight: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  hofChampion: { fontSize: 16, fontWeight: "700" },
  hofScore: { fontSize: 14, fontWeight: "700", color: "#aaa" },
  hofEntry: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 3 },
  hofEntryRank: { fontSize: 14 },
  hofEntryName: { flex: 1, fontSize: 13, color: "#ccc" },
  hofEntryScore: { fontSize: 13, color: "#888", fontWeight: "600" },
});
