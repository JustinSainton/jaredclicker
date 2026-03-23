// Tic-Tac-Toe — classic strategy battle
import React, { useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import * as Haptics from "../../lib/haptics";
import t from "../../lib/i18n";

export default function TTTGame({ game, playerName, onMove, theme }) {
  const isP1 = playerName.toLowerCase() === game.player1.toLowerCase();
  const mySymbol = game.tttSymbols?.[isP1 ? game.player1 : game.player2] || (isP1 ? "X" : "O");
  const isMyTurn = game.tttCurrentTurn?.toLowerCase() === playerName.toLowerCase();
  const opponent = isP1 ? game.player2 : game.player1;

  const handleCellPress = useCallback((index) => {
    if (!isMyTurn || game.tttBoard[index] !== null || game.winner) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onMove(game.id, index);
  }, [isMyTurn, game.tttBoard, game.winner, game.id, onMove]);

  // Check for winning line to highlight
  const winLine = getWinLine(game.tttBoard);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t("ticTacToe")}</Text>
      <Text style={styles.vs}>{game.player1} {t("versus")} {game.player2}</Text>
      <Text style={[styles.wager, { color: theme.primary }]}>
        {t("currencyAmount", { amount: game.wagerCoins.toLocaleString(), currency: theme.currencyName })}
      </Text>

      {/* Turn indicator */}
      {!game.winner && (
        <View style={[styles.turnBadge, isMyTurn && { backgroundColor: theme.primary + "22", borderColor: theme.primary }]}>
          <Text style={[styles.turnText, isMyTurn && { color: theme.primary }]}>
            {isMyTurn ? t("yourTurn") : t("opponentTurn", { name: opponent })}
          </Text>
          <Text style={styles.turnSymbol}>{t("youAre", { symbol: mySymbol })}</Text>
        </View>
      )}

      {/* Board */}
      <View style={styles.board}>
        {game.tttBoard.map((cell, index) => {
          const isWinCell = winLine && winLine.includes(index);
          const isEmpty = cell === null;
          return (
            <TouchableOpacity
              key={index}
              style={[
                styles.cell,
                index % 3 !== 2 && styles.cellBorderRight,
                index < 6 && styles.cellBorderBottom,
                isWinCell && { backgroundColor: theme.primary + "22" },
                isEmpty && isMyTurn && !game.winner && styles.cellClickable,
              ]}
              onPress={() => handleCellPress(index)}
              disabled={!isEmpty || !isMyTurn || !!game.winner}
              activeOpacity={isEmpty && isMyTurn ? 0.7 : 1}
            >
              {cell && (
                <Text style={[
                  styles.cellText,
                  cell === "X" ? styles.cellX : styles.cellO,
                  isWinCell && { color: theme.primary },
                ]}>
                  {cell}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

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

function getWinLine(board) {
  const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return [a, b, c];
  }
  return null;
}

const styles = StyleSheet.create({
  container: { padding: 20, alignItems: "center" },
  title: { fontSize: 22, fontWeight: "800", color: "#fff" },
  vs: { fontSize: 14, color: "#aaa", marginTop: 4 },
  wager: { fontSize: 16, fontWeight: "700", marginTop: 8 },
  turnBadge: {
    marginTop: 16, paddingHorizontal: 20, paddingVertical: 10,
    borderRadius: 12, borderWidth: 1, borderColor: "#333",
    backgroundColor: "#16213e", alignItems: "center",
  },
  turnText: { fontSize: 15, fontWeight: "700", color: "#aaa" },
  turnSymbol: { fontSize: 12, color: "#666", marginTop: 2 },
  board: {
    width: 270, flexDirection: "row", flexWrap: "wrap", marginTop: 24,
    borderRadius: 8, overflow: "hidden",
  },
  cell: {
    width: 90, height: 90,
    justifyContent: "center", alignItems: "center",
  },
  cellBorderRight: { borderRightWidth: 2, borderRightColor: "#333" },
  cellBorderBottom: { borderBottomWidth: 2, borderBottomColor: "#333" },
  cellClickable: { backgroundColor: "rgba(255,255,255,0.03)" },
  cellText: { fontSize: 40, fontWeight: "900" },
  cellX: { color: "#60a5fa" },
  cellO: { color: "#f87171" },
  result: {
    marginTop: 24, padding: 20, borderRadius: 16,
    borderWidth: 2, alignItems: "center", width: "100%",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  resultEmoji: { fontSize: 48 },
  resultText: { fontSize: 24, fontWeight: "800", marginTop: 8 },
});
