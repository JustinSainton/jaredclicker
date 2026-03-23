// Spectator View — watch ongoing battles between other players
// Shows: live game state, player scores, spectator count
// Accessible from: BattleScreen active games list
import React, { useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Modal } from "react-native";
import * as Haptics from "../lib/haptics";
import { useGame } from "../context/GameContext";
import { useOrg } from "../context/OrgContext";
import { formatNumber } from "../lib/gameEngine";
import t from "../lib/i18n";

const GAME_NAME_KEYS = {
  rps: "rockPaperScissors",
  coinflip: "coinFlip",
  clickerduel: "clickerDuel",
  trivia: "trivia",
  ttt: "ticTacToe",
  reaction: "reactionRace",
  connect4: "connect4",
  hangman: "hangman",
  battleship: "battleship",
};

// Shows list of active games that can be spectated
export function ActiveGamesList({ onSpectate }) {
  const { activeGames, player } = useGame();
  const { theme } = useOrg();
  const getGameName = (type) => (GAME_NAME_KEYS[type] ? t(GAME_NAME_KEYS[type]) : type);

  // Filter out games the player is in
  const spectatable = (activeGames || []).filter(g => {
    const isPlayer = g.player1?.toLowerCase() === player?.name?.toLowerCase() ||
                     g.player2?.toLowerCase() === player?.name?.toLowerCase();
    return !isPlayer;
  });

  if (spectatable.length === 0) return null;

  return (
    <View style={styles.listWrap}>
      <Text style={styles.listTitle}>{"\uD83D\uDC40"} {t("watchLiveGames")}</Text>
      {spectatable.map(game => (
        <TouchableOpacity
          key={game.id}
          style={styles.gameRow}
          onPress={() => { Haptics.selectionAsync(); onSpectate(game); }}
        >
          <View style={styles.gameInfo}>
            <Text style={styles.gamePlayers}>
              {game.player1} {t("versus")} {game.player2}
            </Text>
            <Text style={styles.gameType}>
              {getGameName(game.type)} - {t("onTheLine", {
                amount: formatNumber(game.wagerCoins),
                currency: theme.currencyName,
              })}
            </Text>
          </View>
          <View style={[styles.watchBtn, { backgroundColor: theme.primary + "22", borderColor: theme.primary + "44" }]}>
            <Text style={[styles.watchBtnText, { color: theme.primary }]}>{"\uD83D\uDC40"} {t("watch")}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// Full spectator modal — shows live game updates
export function SpectatorModal({ game, onClose }) {
  const { theme } = useOrg();
  const { sendWS } = useGame();
  const getGameName = (type) => (GAME_NAME_KEYS[type] ? t(GAME_NAME_KEYS[type]) : type);

  // Join as spectator on mount
  useEffect(() => {
    if (game?.id) {
      sendWS({ type: "spectateGame", gameId: game.id });
    }
    return () => {
      if (game?.id) {
        sendWS({ type: "leaveSpectate", gameId: game.id });
      }
    };
  }, [game?.id, sendWS]);

  if (!game) return null;

  return (
    <Modal transparent visible={true} animationType="slide">
      <View style={styles.spectatorOverlay}>
        <View style={styles.spectatorHeader}>
          <View>
            <Text style={styles.spectatorBadge}>{"\uD83D\uDC40"} {t("spectating")}</Text>
            <Text style={styles.spectatorTitle}>
              {getGameName(game.type)}
            </Text>
          </View>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>{"\u2715"}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.spectatorPlayers}>
          <View style={styles.spectatorPlayer}>
            <Text style={[styles.spectatorName, { color: "#60a5fa" }]}>{game.player1}</Text>
            <Text style={styles.spectatorScore}>{game.p1Score || 0}</Text>
          </View>
          <Text style={styles.spectatorVs}>{t("versus")}</Text>
          <View style={styles.spectatorPlayer}>
            <Text style={[styles.spectatorName, { color: "#f87171" }]}>{game.player2}</Text>
            <Text style={styles.spectatorScore}>{game.p2Score || 0}</Text>
          </View>
        </View>

        <View style={styles.spectatorWager}>
          <Text style={[styles.spectatorWagerText, { color: theme.primary }]}>
            {t("onTheLine", { amount: formatNumber(game.wagerCoins), currency: theme.currencyName })}
          </Text>
        </View>

        {game.winner && (
          <View style={[styles.spectatorResult, { borderColor: theme.primary }]}>
          <Text style={styles.spectatorResultEmoji}>
            {game.winner === "draw" ? "\uD83E\uDD1D" : "\uD83C\uDFC6"}
          </Text>
          <Text style={[styles.spectatorResultText, { color: theme.primary }]}>
            {game.winner === "draw" ? t("draw") : t("wins", { name: game.winner })}
          </Text>
        </View>
      )}

        {!game.winner && (
          <View style={styles.spectatorLive}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>{t("live")}</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Active games list
  listWrap: { marginTop: 16 },
  listTitle: { fontSize: 14, fontWeight: "700", color: "#aaa", marginBottom: 8 },
  gameRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: "#16213e", borderRadius: 12, padding: 12, marginBottom: 6,
    borderWidth: 1, borderColor: "#1e2a45",
  },
  gameInfo: { flex: 1 },
  gamePlayers: { fontSize: 14, fontWeight: "600", color: "#fff" },
  gameType: { fontSize: 12, color: "#888", marginTop: 2 },
  watchBtn: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1 },
  watchBtnText: { fontSize: 12, fontWeight: "700" },

  // Spectator modal
  spectatorOverlay: { flex: 1, backgroundColor: "#0a0a14", paddingTop: 60, padding: 20 },
  spectatorHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
  },
  spectatorBadge: { fontSize: 11, color: "#f59e0b", fontWeight: "800", letterSpacing: 1, textTransform: "uppercase" },
  spectatorTitle: { fontSize: 22, fontWeight: "800", color: "#fff", marginTop: 4 },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.1)",
    justifyContent: "center", alignItems: "center",
  },
  closeBtnText: { color: "#fff", fontSize: 16 },
  spectatorPlayers: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    marginTop: 40, gap: 24,
  },
  spectatorPlayer: { alignItems: "center", flex: 1 },
  spectatorName: { fontSize: 18, fontWeight: "700" },
  spectatorScore: { fontSize: 36, fontWeight: "900", color: "#fff", marginTop: 8 },
  spectatorVs: { fontSize: 16, fontWeight: "800", color: "#666" },
  spectatorWager: { alignItems: "center", marginTop: 20 },
  spectatorWagerText: { fontSize: 16, fontWeight: "700" },
  spectatorResult: {
    marginTop: 32, padding: 24, borderRadius: 16,
    borderWidth: 2, alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  spectatorResultEmoji: { fontSize: 56 },
  spectatorResultText: { fontSize: 28, fontWeight: "800", marginTop: 8 },
  spectatorLive: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, marginTop: 32,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#ef4444" },
  liveText: { fontSize: 13, fontWeight: "800", color: "#ef4444", letterSpacing: 2 },
});
