// Group Game Lobby — create/join/start group games (3-20 players)
// Supports: Last Click Standing, Auction House, Trivia Royale
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
import * as Haptics from "expo-haptics";
import { useGame } from "../context/GameContext";
import { useOrg } from "../context/OrgContext";
import { formatNumber } from "../lib/gameEngine";
import t from "../lib/i18n";

const GROUP_GAME_TYPES = [
  {
    key: "lastclick",
    nameKey: "lastClickStanding",
    emoji: "\uD83D\uDC46",
    descKey: "lastClickDesc",
    minPlayers: 3,
    maxPlayers: 20,
  },
  {
    key: "triviaroyale",
    nameKey: "triviaRoyale",
    emoji: "\uD83E\uDDE0",
    descKey: "triviaRoyaleDesc",
    minPlayers: 3,
    maxPlayers: 20,
  },
  {
    key: "auction",
    nameKey: "auctionHouse",
    emoji: "\uD83D\uDD28",
    descKey: "auctionDesc",
    minPlayers: 3,
    maxPlayers: 10,
  },
];

export default function GroupGameLobby() {
  const {
    player, groupLobbies, createGroupLobby, joinGroupLobby, startGroupGame,
  } = useGame();
  const { theme } = useOrg();

  const [showCreate, setShowCreate] = useState(false);
  const [selectedType, setSelectedType] = useState("lastclick");
  const [wager, setWager] = useState("500");

  const handleCreate = useCallback(() => {
    const wagerAmount = parseInt(wager, 10);
    if (!wagerAmount || wagerAmount < 100) {
      Alert.alert(t("invalidWager"), t("minimumWager", { currency: theme.currencyName }));
      return;
    }
    const gameType = GROUP_GAME_TYPES.find(g => g.key === selectedType);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    createGroupLobby(selectedType, wagerAmount, gameType?.minPlayers || 3, gameType?.maxPlayers || 20);
    setShowCreate(false);
  }, [selectedType, wager, createGroupLobby, theme.currencyName]);

  const handleJoin = useCallback((lobbyId) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    joinGroupLobby(lobbyId);
  }, [joinGroupLobby]);

  const handleStart = useCallback((lobbyId) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    startGroupGame(lobbyId);
  }, [startGroupGame]);

  const activeLobbies = groupLobbies || [];

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>{t("groupGames")}</Text>
        <TouchableOpacity
          style={[styles.createBtn, { backgroundColor: theme.primary }]}
          onPress={() => { Haptics.selectionAsync(); setShowCreate(!showCreate); }}
        >
          <Text style={[styles.createBtnText, { color: theme.secondary }]}>
            {showCreate ? t("cancel") : t("createLobby")}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Create form */}
      {showCreate && (
        <View style={styles.createCard}>
          <Text style={styles.createTitle}>{t("createGroupGame")}</Text>

          {/* Game type selector */}
          {GROUP_GAME_TYPES.map((game) => (
            <TouchableOpacity
              key={game.key}
              style={[
                styles.gameTypeCard,
                selectedType === game.key && { borderColor: theme.primary, backgroundColor: theme.primary + "11" },
              ]}
              onPress={() => { Haptics.selectionAsync(); setSelectedType(game.key); }}
            >
              <Text style={styles.gameTypeEmoji}>{game.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.gameTypeName, selectedType === game.key && { color: theme.primary }]}>
                  {t(game.nameKey)}
                </Text>
                <Text style={styles.gameTypeDesc}>{t(game.descKey)}</Text>
                <Text style={styles.gameTypePlayers}>
                  {t("playerCountRange", { min: game.minPlayers, max: game.maxPlayers })}
                </Text>
              </View>
            </TouchableOpacity>
          ))}

          {/* Wager */}
          <View style={styles.wagerRow}>
            <Text style={styles.wagerLabel}>{t("wagerPerPlayer")}</Text>
            <TextInput
              style={styles.wagerInput}
              value={wager}
              onChangeText={setWager}
              keyboardType="number-pad"
              maxLength={8}
            />
            <Text style={styles.wagerCurrency}>{theme.currencyName}</Text>
          </View>

          <TouchableOpacity
            style={[styles.startBtn, { backgroundColor: theme.primary }]}
            onPress={handleCreate}
          >
            <Text style={[styles.startBtnText, { color: theme.secondary }]}>{t("createLobbyAction")}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Active lobbies */}
      {activeLobbies.length === 0 && !showCreate ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyEmoji}>{"\uD83C\uDFAE"}</Text>
          <Text style={styles.emptyText}>{t("noGroupGames")}</Text>
          <Text style={styles.emptyHint}>{t("createOneInvite")}</Text>
        </View>
      ) : (
        <FlatList
          data={activeLobbies}
          keyExtractor={(item) => item.id}
          style={styles.lobbyList}
          renderItem={({ item: lobby }) => {
            const gameType = GROUP_GAME_TYPES.find(g => g.key === lobby.type);
            const isHost = lobby.hostName?.toLowerCase() === player?.name?.toLowerCase();
            const isJoined = lobby.players?.some(p => p.toLowerCase() === player?.name?.toLowerCase());
            const canStart = isHost && lobby.players.length >= (lobby.minPlayers || 3);

            return (
              <View style={styles.lobbyCard}>
                <View style={styles.lobbyHeader}>
                  <Text style={styles.lobbyEmoji}>{gameType?.emoji || "\uD83C\uDFAE"}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.lobbyName}>{gameType?.nameKey ? t(gameType.nameKey) : lobby.type}</Text>
                    <Text style={styles.lobbyHost}>{t("hostedBy", { name: lobby.hostName })}</Text>
                  </View>
                  <Text style={[styles.lobbyWager, { color: theme.primary }]}>
                    {formatNumber(lobby.wagerCoins)}
                  </Text>
                </View>

                {/* Players list */}
                <View style={styles.lobbyPlayers}>
                  {lobby.players.map((p, i) => (
                    <View key={i} style={[styles.playerChip, p.toLowerCase() === player?.name?.toLowerCase() && { borderColor: theme.primary }]}>
                      <Text style={styles.playerChipText}>{p}</Text>
                    </View>
                  ))}
                  {/* Empty slots */}
                  {Array.from({ length: Math.max(0, (lobby.minPlayers || 3) - lobby.players.length) }).map((_, i) => (
                    <View key={"empty_" + i} style={[styles.playerChip, styles.playerChipEmpty]}>
                      <Text style={styles.playerChipEmptyText}>?</Text>
                    </View>
                  ))}
                </View>

                <Text style={styles.lobbyCount}>
                  {t("groupLobbyCount", { current: lobby.players.length, max: lobby.maxPlayers || 20 })}
                  {lobby.players.length < (lobby.minPlayers || 3) ? ` (need ${(lobby.minPlayers || 3) - lobby.players.length} more)` : ""}
                </Text>

                {/* Action button */}
                {!isJoined ? (
                  <TouchableOpacity
                    style={[styles.lobbyBtn, { backgroundColor: theme.primary }]}
                    onPress={() => handleJoin(lobby.id)}
                  >
                    <Text style={[styles.lobbyBtnText, { color: theme.secondary }]}>{t("joinGame")}</Text>
                  </TouchableOpacity>
                ) : isHost && canStart ? (
                  <TouchableOpacity
                    style={[styles.lobbyBtn, { backgroundColor: "#4ade80" }]}
                    onPress={() => handleStart(lobby.id)}
                  >
                    <Text style={[styles.lobbyBtnText, { color: "#1a1a2e" }]}>{t("startGame")}</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={[styles.lobbyBtn, { backgroundColor: "#333" }]}>
                    <Text style={styles.lobbyBtnText}>
                      {isHost ? t("waitingForPlayers") : t("waitingToStart")}
                    </Text>
                  </View>
                )}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, paddingBottom: 8 },
  header: { fontSize: 20, fontWeight: "800", color: "#fff" },
  createBtn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  createBtnText: { fontSize: 13, fontWeight: "700" },

  // Create form
  createCard: { margin: 16, marginTop: 0, backgroundColor: "#16213e", borderRadius: 16, padding: 16 },
  createTitle: { fontSize: 16, fontWeight: "700", color: "#fff", marginBottom: 12 },
  gameTypeCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 12, borderRadius: 12, borderWidth: 1, borderColor: "#222",
    marginBottom: 8,
  },
  gameTypeEmoji: { fontSize: 28 },
  gameTypeName: { fontSize: 14, fontWeight: "700", color: "#ccc" },
  gameTypeDesc: { fontSize: 11, color: "#888", marginTop: 2 },
  gameTypePlayers: { fontSize: 10, color: "#666", marginTop: 2 },
  wagerRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12, marginBottom: 12 },
  wagerLabel: { fontSize: 13, color: "#aaa" },
  wagerInput: {
    backgroundColor: "#0f0f23", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
    color: "#fff", fontSize: 16, fontWeight: "700", width: 80, textAlign: "center",
    borderWidth: 1, borderColor: "#333",
  },
  wagerCurrency: { fontSize: 13, color: "#888" },
  startBtn: { borderRadius: 12, padding: 14, alignItems: "center" },
  startBtnText: { fontSize: 15, fontWeight: "700" },

  // Empty state
  emptyWrap: { alignItems: "center", paddingTop: 60 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, color: "#666", fontWeight: "600" },
  emptyHint: { fontSize: 13, color: "#444", marginTop: 4 },

  // Lobby list
  lobbyList: { padding: 16, paddingTop: 8 },
  lobbyCard: { backgroundColor: "#16213e", borderRadius: 16, padding: 16, marginBottom: 12 },
  lobbyHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  lobbyEmoji: { fontSize: 28 },
  lobbyName: { fontSize: 15, fontWeight: "700", color: "#fff" },
  lobbyHost: { fontSize: 12, color: "#888", marginTop: 2 },
  lobbyWager: { fontSize: 18, fontWeight: "800" },
  lobbyPlayers: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  playerChip: {
    backgroundColor: "#0f0f23", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: "#333",
  },
  playerChipText: { fontSize: 12, color: "#ccc", fontWeight: "500" },
  playerChipEmpty: { borderStyle: "dashed" },
  playerChipEmptyText: { fontSize: 12, color: "#555" },
  lobbyCount: { fontSize: 11, color: "#666", marginBottom: 10 },
  lobbyBtn: { borderRadius: 10, padding: 12, alignItems: "center" },
  lobbyBtnText: { fontSize: 14, fontWeight: "700", color: "#aaa" },
});
