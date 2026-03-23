// Leaderboard — podium, tappable players, profile/action modal
import React, { useState, useMemo, useCallback } from "react";
import { View, Text, FlatList, TouchableOpacity, Pressable, Modal, StyleSheet, Dimensions, Alert } from "react-native";
import * as Haptics from "../lib/haptics";
import { useGame } from "../context/GameContext";
import { useOrg } from "../context/OrgContext";
import { useGameState } from "../hooks/useGameState";
import { formatNumber } from "../lib/gameEngine";
import { scoreStyle, headingStyle, bodyStyle, labelStyle } from "../lib/theme-styles";
import t from "../lib/i18n";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// ─── PODIUM ──────────────────────────────────────────────────────────────────

function Podium({ top3, theme, onTapPlayer }) {
  if (!top3 || top3.length < 1) return null;

  const PODIUM_COLORS = {
    gold: { bg: "#FFD70022", border: "#FFD700", text: "#FFD700", glow: "rgba(255,215,0,0.3)" },
    silver: { bg: "#C0C0C022", border: "#C0C0C0", text: "#C0C0C0", glow: "rgba(192,192,192,0.2)" },
    bronze: { bg: "#CD7F3222", border: "#CD7F32", text: "#CD7F32", glow: "rgba(205,127,50,0.2)" },
  };

  const spots = [
    { entry: top3[1], height: 72, label: "2ND", medal: "\uD83E\uDD48", colors: PODIUM_COLORS.silver, crown: false },
    { entry: top3[0], height: 100, label: "1ST", medal: "\uD83E\uDD47", colors: PODIUM_COLORS.gold, crown: true },
    { entry: top3[2], height: 52, label: "3RD", medal: "\uD83E\uDD49", colors: PODIUM_COLORS.bronze, crown: false },
  ];

  return (
    <View style={podStyles.container}>
      {spots.map((spot, i) => {
        if (!spot.entry) return <View key={i} style={podStyles.spotWrap} />;
        const c = spot.colors;
        return (
          <Pressable key={i} style={podStyles.spotWrap} onPress={() => onTapPlayer?.(spot.entry)}>
            {spot.crown && <Text style={podStyles.crown}>{"\uD83D\uDC51"}</Text>}
            <Text style={podStyles.medal}>{spot.medal}</Text>
            <Text style={podStyles.name} numberOfLines={1}>{spot.entry.name}</Text>
            <Text style={[podStyles.score, { color: c.text }]}>{formatNumber(spot.entry.score)}</Text>
            <View style={[podStyles.bar, {
              height: spot.height,
              backgroundColor: c.bg,
              borderColor: c.border,
              shadowColor: c.glow,
              shadowOpacity: 0.8,
              shadowRadius: 12,
            }]}>
              <Text style={[podStyles.barLabel, { color: c.text }]}>{spot.label}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const podStyles = StyleSheet.create({
  container: { flexDirection: "row", alignItems: "flex-end", justifyContent: "center", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4, gap: 10 },
  spotWrap: { flex: 1, alignItems: "center" },
  crown: { fontSize: 20, marginBottom: -2 },
  medal: { fontSize: 26, marginBottom: 2 },
  name: { fontSize: 12, fontWeight: "700", color: "#fff", marginBottom: 2 },
  score: { fontSize: 11, fontWeight: "800", marginBottom: 4 },
  bar: {
    width: "100%", borderRadius: 8, borderWidth: 1.5,
    alignItems: "center", justifyContent: "flex-end", paddingBottom: 6,
    shadowOffset: { width: 0, height: 0 }, elevation: 4,
  },
  barLabel: { fontSize: 9, fontWeight: "800", letterSpacing: 1 },
});

// ─── PLAYER ACTION MODAL ─────────────────────────────────────────────────────

function PlayerModal({ player, visible, onClose, theme, onChallenge, isMe, isOnline, sabotages }) {
  if (!player) return null;
  const s = player.stats || {};
  const isSabotaged = sabotages?.some(sab => sab.targetName?.toLowerCase() === player.name.toLowerCase());

  const stats = [
    { label: "Total Coins", value: formatNumber(player.score) },
    { label: "Per Click", value: formatNumber(s.coinsPerClick || 0) },
    { label: "Per Second", value: formatNumber(s.coinsPerSecond || 0) },
    { label: "Total Clicks", value: formatNumber(s.totalClicks || 0) },
    { label: "Sightings", value: formatNumber(s.sightings || 0) },
  ];

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={modalStyles.overlay} onPress={onClose}>
        <Pressable style={modalStyles.card} onPress={() => {}}>
          {/* Header */}
          <Text style={[modalStyles.name, headingStyle(theme), { color: theme.primary }]}>{player.name}</Text>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 16, alignItems: "center" }}>
            {isOnline && <View style={modalStyles.onlineBadge}><View style={modalStyles.onlineDot} /><Text style={modalStyles.onlineText}>Online</Text></View>}
            {isSabotaged && <View style={[modalStyles.onlineBadge, { backgroundColor: "rgba(239,68,68,0.15)" }]}><Text style={{ fontSize: 12, color: "#ef4444", fontWeight: "700" }}>SABOTAGED</Text></View>}
            {isMe && <View style={[modalStyles.onlineBadge, { backgroundColor: "rgba(255,215,0,0.1)" }]}><Text style={{ fontSize: 12, color: theme.primary, fontWeight: "700" }}>YOU</Text></View>}
          </View>

          {/* Stats rows */}
          {stats.map((stat, i) => (
            <View key={i} style={modalStyles.statRow}>
              <Text style={modalStyles.statLabel}>{stat.label}</Text>
              <Text style={[modalStyles.statValue, { color: theme.primary }]}>{stat.value}</Text>
            </View>
          ))}

          {/* Actions (only for other players) */}
          {!isMe && (
            <View style={modalStyles.actions}>
              <TouchableOpacity style={[modalStyles.actionBtn, { backgroundColor: theme.primary }]} onPress={() => { onChallenge?.(player.name, "challenge"); onClose(); }}>
                <Text style={[modalStyles.actionBtnText, { color: theme.secondary || "#1a1a2e" }]}>{"\u2694\uFE0F"} Challenge</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[modalStyles.actionBtn, { backgroundColor: "#ef4444" }]} onPress={() => { onChallenge?.(player.name, "sabotage"); onClose(); }}>
                <Text style={modalStyles.actionBtnText}>{"\uD83D\uDCA3"} Sabotage</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[modalStyles.actionBtn, { backgroundColor: "#3b82f6" }]} onPress={() => { onChallenge?.(player.name, "freeze"); onClose(); }}>
                <Text style={modalStyles.actionBtnText}>{"\u2744\uFE0F"} Freeze</Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity style={modalStyles.closeBtn} onPress={onClose}>
            <Text style={modalStyles.closeBtnText}>Close</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center" },
  card: { backgroundColor: "#14141e", borderRadius: 20, padding: 24, width: "88%", maxWidth: 380, borderWidth: 2, borderColor: "rgba(255,255,255,0.08)", alignItems: "center" },
  name: { fontSize: 20, fontWeight: "800", color: "#fff", marginBottom: 4 },
  onlineBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(74,222,128,0.1)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#4ade80" },
  onlineText: { fontSize: 12, color: "#4ade80", fontWeight: "600" },
  statRow: { flexDirection: "row", justifyContent: "space-between", width: "100%", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)" },
  statLabel: { fontSize: 13, color: "#aaa", fontWeight: "500" },
  statValue: { fontSize: 13, fontWeight: "800" },
  actions: { flexDirection: "row", gap: 8, width: "100%", marginTop: 16, marginBottom: 8 },
  actionBtn: { flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: "center" },
  actionBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  closeBtn: { paddingVertical: 10, marginTop: 4 },
  closeBtnText: { color: "#888", fontSize: 14 },
});

// ─── MAIN LEADERBOARD ────────────────────────────────────────────────────────

export default function LeaderboardScreen() {
  const { leaderboard, online, player, hallOfFame, challenge, sabotages, credits, useSabotageCredit } = useGame();
  const { theme } = useOrg();
  const { gameState } = useGameState();
  const [tab, setTab] = useState("weekly");
  const [selectedPlayer, setSelectedPlayer] = useState(null);

  const myRank = useMemo(() => {
    const idx = leaderboard.findIndex(e => e.name.toLowerCase() === player?.name?.toLowerCase());
    return idx >= 0 ? idx + 1 : null;
  }, [leaderboard, player?.name]);

  const myEntry = useMemo(() => {
    if (myRank) return null;
    if (!player?.name || !gameState?.coins) return null;
    return { name: player.name, score: gameState.coins, stats: { coinsPerSecond: gameState.coinsPerSecond }, _isOutOfRange: true };
  }, [myRank, player?.name, gameState?.coins, gameState?.coinsPerSecond]);

  const top3 = useMemo(() => leaderboard.slice(0, 3), [leaderboard]);
  const restOfList = useMemo(() => leaderboard.slice(3), [leaderboard]);

  const handleTapPlayer = useCallback((entry) => {
    Haptics.selectionAsync();
    setSelectedPlayer(entry);
  }, []);

  const handlePlayerAction = useCallback((name, action) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (action === "challenge") {
      challenge(name, "coinflip", 500);
    } else if (action === "sabotage") {
      // Use a sabotage credit via WS
      if (credits?.sabotage > 0) {
        useSabotageCredit(name);
      } else {
        Alert.alert("No Credits", "Buy sabotage credits from the Shop tab first!");
      }
    } else if (action === "freeze") {
      Alert.alert("Freeze", "Freezing is available as a paid action from the Shop tab.");
    }
  }, [challenge, credits]);

  const renderItem = ({ item, index }) => {
    const isMe = player?.name?.toLowerCase() === item.name.toLowerCase();
    const isOutOfRange = item._isOutOfRange;
    const rank = isOutOfRange ? "50+" : index + 4; // +4 because top 3 are in podium
    const isOnline = online.includes(item.name);
    const isSab = sabotages?.some(sab => sab.targetName?.toLowerCase() === item.name.toLowerCase());

    return (
      <Pressable onPress={() => handleTapPlayer(item)}>
        <View style={[
          styles.row,
          isMe && { backgroundColor: theme.primary + "15", borderColor: theme.primary + "44" },
          isOutOfRange && styles.rowOutOfRange,
          isSab && { borderColor: "rgba(239,68,68,0.3)" },
        ]}>
          <View style={styles.rank}>
            <Text style={[styles.rankNum, isMe && { color: theme.primary }]}>{rank}</Text>
          </View>
          <View style={styles.playerInfo}>
            <View style={styles.nameRow}>
              <Text style={[styles.name, isMe && { color: theme.primary }]}>{item.name}</Text>
              {isOnline && <View style={styles.onlineDot} />}
              {isMe && <Text style={styles.youBadge}>YOU</Text>}
              {isSab && <Text style={styles.sabBadge}>SLOWED</Text>}
            </View>
            {item.stats?.coinsPerSecond > 0 && (
              <Text style={styles.subtitle}>{formatNumber(item.stats.coinsPerSecond)}/sec</Text>
            )}
          </View>
          <Text style={[styles.score, { color: theme.primary }, isMe && { fontWeight: "900" }]}>
            {formatNumber(item.score)}
          </Text>
        </View>
      </Pressable>
    );
  };

  const renderHofItem = ({ item: week }) => (
    <View style={styles.hofRow}>
      <View style={styles.hofLeft}>
        <Text style={styles.hofWeek}>Week {week.week}</Text>
        <Text style={styles.hofDate}>{week.date}</Text>
      </View>
      <View style={styles.hofRight}>
        <Text style={[styles.hofChampion, { color: theme.primary }]}>{"\uD83C\uDFC6"} {week.champion}</Text>
        <Text style={styles.hofScore}>{formatNumber(week.championScore)}</Text>
      </View>
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
          <Text style={[styles.tabText, tab === "weekly" && { color: theme.primary }]}>Leaderboard</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === "hof" && { borderBottomColor: theme.primary, borderBottomWidth: 2 }]}
          onPress={() => { Haptics.selectionAsync(); setTab("hof"); }}
        >
          <Text style={[styles.tabText, tab === "hof" && { color: theme.primary }]}>{"\uD83C\uDFC6"} Hall of Fame</Text>
        </TouchableOpacity>
      </View>

      {/* Header */}
      <View style={styles.headerStats}>
        <Text style={styles.onlineCount}>
          <Text style={{ color: "#4ade80" }}>{"\u25CF"}</Text> {online?.length || 0} online
        </Text>
        {myRank && <Text style={[styles.myRank, { color: theme.primary }]}>Your rank: #{myRank}</Text>}
      </View>

      {tab === "weekly" ? (
        <FlatList
          data={myEntry ? [...restOfList, myEntry] : restOfList}
          keyExtractor={(item, i) => item._isOutOfRange ? "me" : item.name.toLowerCase()}
          renderItem={renderItem}
          style={styles.list}
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={<Podium top3={top3} theme={theme} onTapPlayer={handleTapPlayer} />}
          ListEmptyComponent={
            top3.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyEmoji}>{"\uD83C\uDFC6"}</Text>
                <Text style={styles.emptyText}>No scores yet</Text>
              </View>
            ) : null
          }
        />
      ) : (
        <FlatList
          data={[...(hallOfFame || [])].reverse()}
          keyExtractor={(item) => String(item.week)}
          renderItem={renderHofItem}
          style={styles.list}
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyEmoji}>{"\uD83C\uDFC6"}</Text>
              <Text style={styles.emptyText}>No hall of fame yet</Text>
              <Text style={styles.emptyHint}>Complete a weekly reset to start recording champions</Text>
            </View>
          }
        />
      )}

      {/* Player action modal */}
      <PlayerModal
        player={selectedPlayer}
        visible={!!selectedPlayer}
        onClose={() => setSelectedPlayer(null)}
        theme={theme}
        onChallenge={handlePlayerAction}
        isMe={selectedPlayer?.name?.toLowerCase() === player?.name?.toLowerCase()}
        isOnline={selectedPlayer ? online.includes(selectedPlayer.name) : false}
        sabotages={sabotages}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#222" },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: "center" },
  tabText: { fontSize: 14, fontWeight: "600", color: "#888" },
  headerStats: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 8 },
  onlineCount: { fontSize: 13, color: "#888" },
  myRank: { fontSize: 13, fontWeight: "700" },
  list: { flex: 1, paddingHorizontal: 16 },
  row: {
    flexDirection: "row", alignItems: "center", padding: 12,
    backgroundColor: "rgba(0,0,0,0.25)", borderRadius: 10, marginBottom: 4,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.06)",
  },
  rowOutOfRange: { marginTop: 8, borderTopWidth: 1, borderTopColor: "#333" },
  rank: { width: 32, alignItems: "center" },
  rankNum: { fontSize: 14, color: "#aaa", fontWeight: "800" },
  playerInfo: { flex: 1, marginLeft: 8 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { fontSize: 14, color: "#ddd", fontWeight: "600" },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#4ade80" },
  youBadge: { fontSize: 9, color: "#FFD700", backgroundColor: "rgba(255,215,0,0.1)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, fontWeight: "800" },
  sabBadge: { fontSize: 8, color: "#ef4444", backgroundColor: "rgba(239,68,68,0.15)", paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, fontWeight: "800", letterSpacing: 0.5 },
  subtitle: { fontSize: 11, color: "#888", marginTop: 2 },
  score: { fontSize: 14, fontWeight: "800", fontVariant: ["tabular-nums"] },
  emptyWrap: { alignItems: "center", paddingTop: 60 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, color: "#aaa", fontWeight: "600" },
  emptyHint: { fontSize: 13, color: "#888", marginTop: 4, textAlign: "center" },
  hofRow: { backgroundColor: "#16213e", borderRadius: 14, padding: 16, marginBottom: 10 },
  hofLeft: { marginBottom: 8 },
  hofWeek: { fontSize: 13, fontWeight: "700", color: "#aaa" },
  hofDate: { fontSize: 11, color: "#aaa", marginTop: 2 },
  hofRight: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  hofChampion: { fontSize: 16, fontWeight: "700" },
  hofScore: { fontSize: 14, fontWeight: "700", color: "#aaa" },
  hofEntry: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 3 },
  hofEntryRank: { fontSize: 14 },
  hofEntryName: { flex: 1, fontSize: 13, color: "#ccc" },
  hofEntryScore: { fontSize: 13, color: "#888", fontWeight: "600" },
});
