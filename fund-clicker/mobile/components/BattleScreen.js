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
            <Text style={[styles.gameName, selectedGame === game.key && { color: theme.primary }]}>
              {t(game.labelKey)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Wager input */}
      <View style={styles.wagerRow}>
        <Text style={styles.wagerLabel}>{t("wager")}:</Text>
        <TextInput
          style={styles.wagerInput}
          value={wager}
          onChangeText={setWager}
          keyboardType="number-pad"
          placeholderTextColor="#666"
        />
        <Text style={styles.wagerCurrency}>{theme.currencyName}</Text>
      </View>

      {/* Online players */}
      <Text style={styles.sectionTitle}>{t("onlinePlayers")} ({eligiblePlayers.length})</Text>
      <FlatList
        data={eligiblePlayers}
        keyExtractor={(item) => item}
        style={styles.playerList}
        renderItem={({ item }) => {
          const entry = leaderboard.find((e) => e.name.toLowerCase() === item.toLowerCase());
          return (
            <TouchableOpacity
              style={styles.playerRow}
              onPress={() => handleChallenge(item)}
            >
              <View>
                <Text style={styles.playerName}>{item}</Text>
                <Text style={styles.playerScore}>
                  {entry ? formatNumber(entry.score) + ` ${theme.currencyName}` : ""}
                </Text>
              </View>
              <Text style={[styles.challengeBtn, { color: theme.primary }]}>
                {"\u2694\uFE0F"} {t("fight")}
              </Text>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.empty}>{t("noPlayersOnline")}</Text>
        }
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
  gameName: { fontSize: 11, color: "#aaa", fontWeight: "600", marginTop: 4, textAlign: "center" },
  wagerRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 },
  wagerLabel: { color: "#ccc", fontWeight: "600" },
  wagerInput: {
    backgroundColor: "#16213e", borderRadius: 8, padding: 8, color: "#fff",
    fontSize: 16, fontWeight: "700", width: 80, textAlign: "center",
    borderWidth: 1, borderColor: "#333",
  },
  wagerCurrency: { color: "#888", fontSize: 14 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#ccc", marginBottom: 8 },
  playerList: { flex: 1 },
  playerRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: "#16213e", borderRadius: 10, padding: 12, marginBottom: 6,
  },
  playerName: { fontSize: 16, color: "#fff", fontWeight: "600" },
  playerScore: { fontSize: 12, color: "#888", marginTop: 2 },
  challengeBtn: { fontSize: 14, fontWeight: "700" },
  empty: { color: "#666", textAlign: "center", marginTop: 24 },
  activeBar: {
    backgroundColor: "#16213e", borderRadius: 10, padding: 10,
    alignItems: "center", marginTop: 8,
  },
  activeText: { color: "#FFD700", fontWeight: "600" },
});
