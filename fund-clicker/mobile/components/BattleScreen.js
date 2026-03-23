// Battle screen — challenge other players to games
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  TextInput,
  Alert,
} from "react-native";
import * as Haptics from "../lib/haptics";
import { useGame } from "../context/GameContext";
import { useOrg } from "../context/OrgContext";
import { ActiveGamesList, SpectatorModal } from "./SpectatorView";
import CampaignsList from "./CampaignsList";
import GroupGameLobby from "./GroupGameLobby";
import { formatNumber as fmtNum } from "../lib/gameEngine";
import t from "../lib/i18n";
import { headingStyle, scoreStyle, bodyStyle, cardStyle } from "../lib/theme-styles";

const GAME_TYPES = [
  { key: "coinflip", labelKey: "coinFlip", icon: "\uD83E\uDE99" },
  { key: "rps", labelKey: "rockPaperScissors", icon: "\u270A" },
  { key: "clickerduel", labelKey: "clickerDuel", icon: "\uD83D\uDCA8" },
  { key: "trivia", labelKey: "trivia", icon: "\uD83E\uDDE0" },
  { key: "ttt", labelKey: "ticTacToe", icon: "\u274C" },
  { key: "reaction", labelKey: "reactionRace", icon: "\u26A1" },
  { key: "connect4", labelKey: "connect4", icon: "\uD83D\uDD34" },
  { key: "hangman", labelKey: "hangman", icon: "\uD83D\uDCDD" },
  { key: "battleship", labelKey: "battleship", icon: "\u2693" },
];

export default function BattleScreen() {
  const { online, player, challenge, activeGames, leaderboard, campaigns, challengeSentTo } = useGame();
  const { theme } = useOrg();
  const [selectedGame, setSelectedGame] = useState(null);
  const [wager, setWager] = useState("500");
  const myScore = (leaderboard.find(e => e.name.toLowerCase() === player?.name?.toLowerCase())?.score) || 0;
  const [subTab, setSubTab] = useState("battle");
  const [spectatingGame, setSpectatingGame] = useState(null);

  const activeCampaignCount = campaigns?.filter(c => c.status === "active")?.length || 0;

  const eligiblePlayers = online.filter(
    (name) => name.toLowerCase() !== player?.name?.toLowerCase()
  );

  const handleChallenge = useCallback((targetName) => {
    const wagerAmount = parseInt(wager, 10);
    if (!wagerAmount || wagerAmount < 100) {
      Alert.alert(t("invalidWager"), t("minimumWager", { currency: theme.currencyName }));
      return;
    }
    if (wagerAmount > 10000000) {
      Alert.alert(t("invalidWager"), t("maximumWager", { currency: theme.currencyName }));
      return;
    }
    if (!selectedGame) {
      Alert.alert(t("selectGame"), t("pickGameType"));
      return;
    }
    // Check if player has enough coins
    const myEntry = leaderboard.find(e => e.name.toLowerCase() === player?.name?.toLowerCase());
    if (myEntry && wagerAmount > myEntry.score) {
      Alert.alert(
        t("insufficientFunds", { currency: theme.currencyName }),
        t("youOnlyHave", { amount: formatNumber(myEntry.score), currency: theme.currencyName })
      );
      return;
    }
    const targetEntry = leaderboard.find(e => e.name.toLowerCase() === targetName.toLowerCase());
    if (targetEntry && wagerAmount > targetEntry.score) {
      Alert.alert(
        t("targetCantAffordTitle"),
        t("targetCantAfford", { name: targetName, amount: formatNumber(targetEntry.score), currency: theme.currencyName })
      );
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    challenge(targetName, selectedGame, wagerAmount);
  }, [selectedGame, wager, challenge, leaderboard, player, theme]);

  return (
    <View style={styles.container}>
      {/* Sub-tab toggle */}
      <View style={styles.subTabRow}>
        <TouchableOpacity
          style={[styles.subTab, subTab === "battle" && { borderBottomColor: theme.primary, borderBottomWidth: 2 }]}
          onPress={() => { Haptics.selectionAsync(); setSubTab("battle"); }}
        >
          <Text style={[styles.subTabText, subTab === "battle" && { color: theme.primary }]}>
            {"\u2694\uFE0F"} {t("battle")}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.subTab, subTab === "group" && { borderBottomColor: theme.primary, borderBottomWidth: 2 }]}
          onPress={() => { Haptics.selectionAsync(); setSubTab("group"); }}
        >
          <Text style={[styles.subTabText, subTab === "group" && { color: theme.primary }]}>
            {"\uD83C\uDFAE"} {t("group")}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.subTab, subTab === "campaigns" && { borderBottomColor: theme.primary, borderBottomWidth: 2 }]}
          onPress={() => { Haptics.selectionAsync(); setSubTab("campaigns"); }}
        >
          <Text style={[styles.subTabText, subTab === "campaigns" && { color: theme.primary }]}>
            {"\uD83D\uDCE2"} {t("campaigns")}{activeCampaignCount > 0 ? ` (${activeCampaignCount})` : ""}
          </Text>
        </TouchableOpacity>
      </View>

      {subTab === "campaigns" ? <CampaignsList /> : null}
      {subTab === "group" ? <GroupGameLobby /> : null}
      {subTab !== "battle" ? null : (
      <View style={{ flex: 1, padding: 16 }}>
      <Text style={[styles.header, headingStyle(theme)]}>{t("battle")}</Text>

      {/* Challenge sent waiting state */}
      {challengeSentTo && (
        <View style={[styles.waitingCard, { borderColor: theme.primary + "44" }]}>
          <Text style={styles.waitingText}>
            {"\u23F3"} {t("waitingFor", { name: challengeSentTo })}
          </Text>
        </View>
      )}

      {/* Game type selector */}
      <View style={styles.gameGrid}>
        {GAME_TYPES.map((game) => (
          <TouchableOpacity
            key={game.key}
            style={[
              styles.gameCard,
              selectedGame === game.key && { borderColor: theme.primary, backgroundColor: theme.primary + "22" },
            ]}
            onPress={() => setSelectedGame(game.key)}
          >
            <Text style={styles.gameIcon}>{game.icon}</Text>
            <Text style={[styles.gameName, bodyStyle(theme), selectedGame === game.key && { color: theme.primary }]}>
              {t(game.labelKey)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Wager presets */}
      <View style={styles.wagerSection}>
        <View style={styles.wagerHeader}>
          <Text style={styles.wagerLabel}>{t("wager")}:</Text>
          <Text style={[styles.wagerAmount, { color: theme.primary }]}>{fmtNum(Number(wager) || 100)} {theme.currencyName}</Text>
        </View>
        <View style={styles.wagerPresets}>
          {[100, 1000, 10000, 100000, 1000000, 10000000].filter(v => v <= Math.max(100, myScore)).map(v => (
            <TouchableOpacity key={v} style={[styles.presetBtn, Number(wager) === v && { borderColor: theme.primary, backgroundColor: theme.primary + "22" }]} onPress={() => { Haptics.selectionAsync(); setWager(String(v)); }}>
              <Text style={[styles.presetText, Number(wager) === v && { color: theme.primary }]}>{v >= 1000000 ? (v / 1000000) + "M" : v >= 1000 ? (v / 1000) + "K" : v}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Online players */}
      {eligiblePlayers.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>{"\u2B24"} Online Now ({eligiblePlayers.length})</Text>
          {eligiblePlayers.map(item => {
            const entry = leaderboard.find(e => e.name.toLowerCase() === item.toLowerCase());
            return (
              <TouchableOpacity key={item} style={styles.playerRow} onPress={() => handleChallenge(item)}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#4ade80" }} />
                  <View>
                    <Text style={styles.playerName}>{item}</Text>
                    <Text style={styles.playerScore}>{entry ? fmtNum(entry.score) + ` ${theme.currencyName}` : ""}</Text>
                  </View>
                </View>
                <Text style={[styles.challengeBtn, { color: theme.primary }]}>{"\u2694\uFE0F"} Fight</Text>
              </TouchableOpacity>
            );
          })}
        </>
      )}

      {/* All players from leaderboard */}
      <Text style={styles.sectionTitle}>Pick Opponent ({leaderboard.filter(e => e.name.toLowerCase() !== player?.name?.toLowerCase()).length})</Text>
      <FlatList
        data={leaderboard.filter(e => e.name.toLowerCase() !== player?.name?.toLowerCase()).slice(0, 20)}
        keyExtractor={(item) => item.name}
        style={styles.playerList}
        renderItem={({ item }) => {
          const isOnline = online.includes(item.name);
          return (
            <TouchableOpacity style={styles.playerRow} onPress={() => handleChallenge(item.name)}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                {isOnline && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#4ade80" }} />}
                <View>
                  <Text style={styles.playerName}>{item.name}</Text>
                  <Text style={styles.playerScore}>{fmtNum(item.score)} {theme.currencyName}</Text>
                </View>
              </View>
              <Text style={[styles.challengeBtn, { color: theme.primary }]}>{"\u2694\uFE0F"} Fight</Text>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>No players yet</Text>}
      />

      {/* Spectatable games */}
      <ActiveGamesList onSpectate={setSpectatingGame} />

      {/* Active games count */}
      {activeGames.length > 0 && (
        <View style={styles.activeBar}>
          <Text style={styles.activeText}>
            {"\uD83C\uDFAE"} {activeGames.length} active game{activeGames.length > 1 ? "s" : ""}
          </Text>
        </View>
      )}
      </View>
      )}

      {/* Spectator modal */}
      {spectatingGame && (
        <SpectatorModal game={spectatingGame} onClose={() => setSpectatingGame(null)} />
      )}
    </View>
  );
}

function formatNumber(n) { return fmtNum(n); }

const styles = StyleSheet.create({
  container: { flex: 1 },
  subTabRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#222" },
  subTab: { flex: 1, paddingVertical: 12, alignItems: "center" },
  subTabText: { fontSize: 14, fontWeight: "600", color: "#888" },
  waitingCard: {
    backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1,
    borderRadius: 12, padding: 14, marginBottom: 16, alignItems: "center",
  },
  waitingText: { fontSize: 14, color: "#aaa" },
  header: { fontSize: 24, fontWeight: "800", color: "#fff", marginBottom: 16 },
  gameGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  gameCard: {
    width: "31%", backgroundColor: "#16213e", borderRadius: 10, padding: 10,
    alignItems: "center", borderWidth: 1, borderColor: "#333",
  },
  gameIcon: { fontSize: 24 },
  gameName: { fontSize: 11, color: "#ccc", fontWeight: "700", marginTop: 4, textAlign: "center" },
  wagerSection: { marginBottom: 16 },
  wagerHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  wagerLabel: { color: "#ccc", fontWeight: "600", fontSize: 14 },
  wagerAmount: { fontSize: 18, fontWeight: "800" },
  sliderTrack: { height: 6, backgroundColor: "#222", borderRadius: 3, overflow: "hidden", marginBottom: 12 },
  sliderFill: { height: "100%", borderRadius: 3 },
  wagerPresets: { flexDirection: "row", gap: 6 },
  presetBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: "#16213e", borderWidth: 1, borderColor: "#333", alignItems: "center" },
  presetText: { fontSize: 12, fontWeight: "700", color: "#888" },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#ccc", marginBottom: 8 },
  playerList: { flex: 1 },
  playerRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: "#16213e", borderRadius: 10, padding: 12, marginBottom: 6,
  },
  playerName: { fontSize: 16, color: "#fff", fontWeight: "600" },
  playerScore: { fontSize: 12, color: "#888", marginTop: 2 },
  challengeBtn: { fontSize: 14, fontWeight: "700" },
  empty: { color: "#aaa", textAlign: "center", marginTop: 24 },
  activeBar: {
    backgroundColor: "#16213e", borderRadius: 10, padding: 10,
    alignItems: "center", marginTop: 8,
  },
  activeText: { color: "#FFD700", fontWeight: "600" },
});
