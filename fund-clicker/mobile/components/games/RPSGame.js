// Rock Paper Scissors — battle game UI
import React, { useState, useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import * as Haptics from "../../lib/haptics";
import t from "../../lib/i18n";

const MOVES = [
  { key: "rock", emoji: "\u270A", labelKey: "rock" },
  { key: "paper", emoji: "\u270B", labelKey: "paper" },
  { key: "scissors", emoji: "\u2702\uFE0F", labelKey: "scissors" },
];

export default function RPSGame({ game, playerName, onMove, theme }) {
  const [selected, setSelected] = useState(null);
  const isP1 = playerName.toLowerCase() === game.player1.toLowerCase();
  const myMove = isP1 ? game.rpsRound?.p1Move : game.rpsRound?.p2Move;
  const opponentChosen = isP1 ? game.rpsRound?.p2Move === "chosen" : game.rpsRound?.p1Move === "chosen";
  const reveal = game.rpsReveal;

  const handleMove = useCallback((move) => {
    if (myMove) return;
    setSelected(move);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onMove(game.id, move);
  }, [myMove, game.id, onMove]);

  const opponent = isP1 ? game.player2 : game.player1;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t("rockPaperScissors")}</Text>
      <Text style={styles.vs}>{game.player1} {t("versus")} {game.player2}</Text>
      <Text style={[styles.wager, { color: theme.primary }]}>
        {t("onTheLine", { amount: game.wagerCoins.toLocaleString(), currency: theme.currencyName })}
      </Text>

      {/* Round info */}
      <Text style={styles.round}>
        {t("roundScore", {
          round: game.round,
          total: game.maxRounds,
          p1: game.p1Score,
          p2: game.p2Score,
        })}
      </Text>

      {/* Reveal */}
      {reveal && (
        <View style={styles.revealRow}>
          <View style={styles.revealMove}>
            <Text style={styles.revealEmoji}>{MOVES.find(m => m.key === reveal.p1Move)?.emoji || "?"}</Text>
            <Text style={styles.revealName}>{game.player1}</Text>
          </View>
          <Text style={styles.revealVs}>{t("versus")}</Text>
          <View style={styles.revealMove}>
            <Text style={styles.revealEmoji}>{MOVES.find(m => m.key === reveal.p2Move)?.emoji || "?"}</Text>
            <Text style={styles.revealName}>{game.player2}</Text>
          </View>
        </View>
      )}

      {/* Move picker */}
      {!myMove && !reveal && (
        <View style={styles.moveRow}>
          {MOVES.map((move) => (
            <TouchableOpacity
              key={move.key}
              style={[
                styles.moveBtn,
                selected === move.key && { borderColor: theme.primary, backgroundColor: theme.primary + "22" },
              ]}
              onPress={() => handleMove(move.key)}
            >
              <Text style={styles.moveEmoji}>{move.emoji}</Text>
              <Text style={styles.moveLabel}>{t(move.labelKey)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Waiting state */}
      {myMove && !reveal && (
        <View style={styles.waiting}>
          <Text style={styles.waitingEmoji}>{MOVES.find(m => m.key === myMove)?.emoji}</Text>
          <Text style={styles.waitingText}>
            {opponentChosen ? t("bothChosenRevealing") : t("waitingForPlayer", { name: opponent })}
          </Text>
        </View>
      )}

      {/* Result */}
      {game.winner && (
        <View style={[styles.result, { borderColor: theme.primary }]}>
          <Text style={styles.resultEmoji}>
            {game.winner === "draw" ? "\uD83E\uDD1D" : game.winner.toLowerCase() === playerName.toLowerCase() ? "\uD83C\uDFC6" : "\uD83D\uDE14"}
          </Text>
          <Text style={[styles.resultText, { color: theme.primary }]}>
            {game.winner === "draw" ? t("draw") : game.winner.toLowerCase() === playerName.toLowerCase() ? t("youWon") : t("youLost")}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, alignItems: "center" },
  title: { fontSize: 22, fontWeight: "800", color: "#fff" },
  vs: { fontSize: 14, color: "#aaa", marginTop: 4 },
  wager: { fontSize: 16, fontWeight: "700", marginTop: 8 },
  round: { fontSize: 12, color: "#888", marginTop: 12 },
  moveRow: { flexDirection: "row", gap: 16, marginTop: 32 },
  moveBtn: {
    width: 90, height: 100, borderRadius: 16,
    backgroundColor: "#16213e", borderWidth: 2, borderColor: "#333",
    justifyContent: "center", alignItems: "center",
  },
  moveEmoji: { fontSize: 40 },
  moveLabel: { fontSize: 12, color: "#ccc", marginTop: 6, fontWeight: "600" },
  waiting: { alignItems: "center", marginTop: 32 },
  waitingEmoji: { fontSize: 60 },
  waitingText: { fontSize: 14, color: "#888", marginTop: 12 },
  revealRow: { flexDirection: "row", alignItems: "center", gap: 20, marginTop: 24 },
  revealMove: { alignItems: "center" },
  revealEmoji: { fontSize: 50 },
  revealName: { fontSize: 12, color: "#aaa", marginTop: 6 },
  revealVs: { fontSize: 18, fontWeight: "800", color: "#666" },
  result: {
    marginTop: 24, padding: 20, borderRadius: 16,
    borderWidth: 2, alignItems: "center", width: "100%",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  resultEmoji: { fontSize: 48 },
  resultText: { fontSize: 24, fontWeight: "800", marginTop: 8 },
});
