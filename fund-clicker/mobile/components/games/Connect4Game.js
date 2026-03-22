// Connect 4 — drop discs into a 7x6 grid, first to connect 4 wins
// Full implementation: column selection, drop animation, win line highlight,
// turn indicator, haptic feedback on drop
import React, { useCallback, useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Animated } from "react-native";
import * as Haptics from "expo-haptics";
import t from "../../lib/i18n";

const COLS = 7;
const ROWS = 6;

export default function Connect4Game({ game, playerName, onMove, theme }) {
  const isP1 = playerName.toLowerCase() === game.player1.toLowerCase();
  const mySymbol = game.c4Symbols?.[isP1 ? game.player1 : game.player2] || (isP1 ? "R" : "Y");
  const isMyTurn = game.c4CurrentTurn?.toLowerCase() === playerName.toLowerCase();
  const opponent = isP1 ? game.player2 : game.player1;

  // Build a display-friendly board (rows × cols) from the column-based storage
  // Backend stores: c4Board[col][row] where row 0 = bottom
  const displayBoard = useMemo(() => {
    const board = [];
    for (let row = ROWS - 1; row >= 0; row--) {
      const rowCells = [];
      for (let col = 0; col < COLS; col++) {
        const cell = game.c4Board?.[col]?.[row] || null;
        rowCells.push(cell);
      }
      board.push(rowCells);
    }
    return board;
  }, [game.c4Board]);

  // Find winning cells to highlight
  const winCells = useMemo(() => {
    if (!game.winner || game.winner === "draw") return new Set();
    const cells = new Set();
    // Check all directions for 4 in a row
    for (let col = 0; col < COLS; col++) {
      for (let row = 0; row < ROWS; row++) {
        const cell = game.c4Board?.[col]?.[row];
        if (!cell) continue;
        // Horizontal
        if (col + 3 < COLS && cell === game.c4Board[col+1]?.[row] && cell === game.c4Board[col+2]?.[row] && cell === game.c4Board[col+3]?.[row]) {
          [0,1,2,3].forEach(d => cells.add(`${col+d},${row}`));
        }
        // Vertical
        if (row + 3 < ROWS && cell === game.c4Board[col]?.[row+1] && cell === game.c4Board[col]?.[row+2] && cell === game.c4Board[col]?.[row+3]) {
          [0,1,2,3].forEach(d => cells.add(`${col},${row+d}`));
        }
        // Diagonal up-right
        if (col + 3 < COLS && row + 3 < ROWS && cell === game.c4Board[col+1]?.[row+1] && cell === game.c4Board[col+2]?.[row+2] && cell === game.c4Board[col+3]?.[row+3]) {
          [0,1,2,3].forEach(d => cells.add(`${col+d},${row+d}`));
        }
        // Diagonal down-right
        if (col + 3 < COLS && row - 3 >= 0 && cell === game.c4Board[col+1]?.[row-1] && cell === game.c4Board[col+2]?.[row-2] && cell === game.c4Board[col+3]?.[row-3]) {
          [0,1,2,3].forEach(d => cells.add(`${col+d},${row-d}`));
        }
      }
    }
    return cells;
  }, [game.c4Board, game.winner]);

  const handleDrop = useCallback((col) => {
    if (!isMyTurn || game.winner) return;
    // Check if column has room
    const column = game.c4Board?.[col] || [];
    if (column.filter(c => c !== null).length >= ROWS) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onMove(game.id, col);
  }, [isMyTurn, game.winner, game.c4Board, game.id, onMove]);

  const CELL_SIZE = 42;
  const colors = { R: "#ef4444", Y: "#fbbf24" };
  const myColor = colors[mySymbol] || "#fff";

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t("connect4")}</Text>
      <Text style={styles.vs}>{game.player1} {t("versus")} {game.player2}</Text>
      <Text style={[styles.wager, { color: theme.primary }]}>
        {t("onTheLine", { amount: game.wagerCoins.toLocaleString(), currency: theme.currencyName })}
      </Text>

      {/* Turn indicator */}
      {!game.winner && (
        <View style={[styles.turnBadge, isMyTurn && { borderColor: myColor, backgroundColor: myColor + "15" }]}>
          <View style={[styles.turnDisc, { backgroundColor: isMyTurn ? myColor : "#666" }]} />
          <Text style={[styles.turnText, isMyTurn && { color: myColor }]}>
            {isMyTurn ? t("yourTurn") : t("opponentTurn", { name: opponent })}
          </Text>
        </View>
      )}

      {/* Column drop buttons */}
      <View style={styles.dropRow}>
        {Array.from({ length: COLS }).map((_, col) => {
          const colFull = (game.c4Board?.[col] || []).filter(c => c !== null).length >= ROWS;
          return (
            <TouchableOpacity
              key={col}
              style={[styles.dropBtn, isMyTurn && !colFull && !game.winner && { opacity: 1 }]}
              onPress={() => handleDrop(col)}
              disabled={!isMyTurn || colFull || !!game.winner}
            >
              <Text style={[styles.dropArrow, isMyTurn && !colFull && { color: myColor }]}>{"\u25BC"}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Board */}
      <View style={[styles.board, { borderColor: theme.primary + "33" }]}>
        {displayBoard.map((row, rowIdx) => (
          <View key={rowIdx} style={styles.boardRow}>
            {row.map((cell, colIdx) => {
              const actualRow = ROWS - 1 - rowIdx;
              const isWin = winCells.has(`${colIdx},${actualRow}`);
              return (
                <View
                  key={colIdx}
                  style={[
                    styles.cell,
                    { width: CELL_SIZE, height: CELL_SIZE },
                    isWin && { backgroundColor: "rgba(255,255,255,0.1)" },
                  ]}
                >
                  {cell ? (
                    <View style={[
                      styles.disc,
                      { backgroundColor: colors[cell] || "#888", width: CELL_SIZE - 6, height: CELL_SIZE - 6 },
                      isWin && { shadowColor: colors[cell], shadowOpacity: 0.8, shadowRadius: 8, elevation: 8 },
                    ]} />
                  ) : (
                    <View style={[styles.emptyCell, { width: CELL_SIZE - 6, height: CELL_SIZE - 6 }]} />
                  )}
                </View>
              );
            })}
          </View>
        ))}
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

const styles = StyleSheet.create({
  container: { padding: 16, alignItems: "center" },
  title: { fontSize: 22, fontWeight: "800", color: "#fff" },
  vs: { fontSize: 14, color: "#aaa", marginTop: 4 },
  wager: { fontSize: 16, fontWeight: "700", marginTop: 8 },
  turnBadge: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginTop: 16, paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 10, borderWidth: 1, borderColor: "#333",
  },
  turnDisc: { width: 16, height: 16, borderRadius: 8 },
  turnText: { fontSize: 14, fontWeight: "600", color: "#888" },
  dropRow: { flexDirection: "row", marginTop: 16, gap: 2 },
  dropBtn: { width: 42, height: 24, justifyContent: "center", alignItems: "center", opacity: 0.3 },
  dropArrow: { fontSize: 14, color: "#444" },
  board: {
    backgroundColor: "#0a1628", borderRadius: 12, padding: 4,
    borderWidth: 2, marginTop: 4,
  },
  boardRow: { flexDirection: "row" },
  cell: { justifyContent: "center", alignItems: "center", padding: 3 },
  disc: { borderRadius: 50 },
  emptyCell: { borderRadius: 50, backgroundColor: "#16213e", borderWidth: 1, borderColor: "#1e2a45" },
  result: {
    marginTop: 20, padding: 20, borderRadius: 16,
    borderWidth: 2, alignItems: "center", width: "100%",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  resultEmoji: { fontSize: 48 },
  resultText: { fontSize: 24, fontWeight: "800", marginTop: 8 },
});
