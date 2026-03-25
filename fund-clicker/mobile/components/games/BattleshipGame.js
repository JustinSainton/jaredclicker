// Battleship — 8x8 grid, take turns firing shots at opponent's ships
// Shows: your ships + opponent's shots on your grid, your shots on opponent's grid
// Ships auto-placed by server. Turn-based firing.
import React, { useState, useCallback, useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import * as Haptics from "../../lib/haptics";
import t from "../../lib/i18n";

const GRID_SIZE = 8;
const CELL_SIZE = 38;

const SHIP_COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ec4899"];
const SHIP_ICONS = ["\uD83D\uDEA2", "\u26F4\uFE0F", "\uD83D\uDEA4", "\u26F5", "\uD83D\uDEE5\uFE0F"];

function GridCell({ x, y, state, isMyGrid, onPress, theme, isLastShot, shipInfo }) {
  // state: null (unknown), "miss", "hit", "ship" (own ship, no hit), "sunk"
  let bg = "#0a1628";
  let border = "#1e2a45";
  let content = null;
  let extraStyle = null;

  if (state === "ship" && shipInfo) {
    bg = shipInfo.color + "33";
    border = shipInfo.color + "88";
    // Rounded corners for bow/stern
    const r = 6;
    if (shipInfo.isH) {
      extraStyle = {
        borderTopLeftRadius: shipInfo.isStart ? r : 0,
        borderBottomLeftRadius: shipInfo.isStart ? r : 0,
        borderTopRightRadius: shipInfo.isEnd ? r : 0,
        borderBottomRightRadius: shipInfo.isEnd ? r : 0,
        marginLeft: shipInfo.isStart ? 1 : 0,
        marginRight: shipInfo.isEnd ? 1 : 0,
      };
    } else {
      extraStyle = {
        borderTopLeftRadius: shipInfo.isStart ? r : 0,
        borderTopRightRadius: shipInfo.isStart ? r : 0,
        borderBottomLeftRadius: shipInfo.isEnd ? r : 0,
        borderBottomRightRadius: shipInfo.isEnd ? r : 0,
        marginTop: shipInfo.isStart ? 1 : 0,
        marginBottom: shipInfo.isEnd ? 1 : 0,
      };
    }
    if (shipInfo.showIcon) {
      content = <Text style={styles.shipIcon}>{shipInfo.icon}</Text>;
    } else {
      content = <View style={[styles.shipDot, { backgroundColor: shipInfo.color + "aa" }]} />;
    }
  } else if (state === "ship") {
    bg = "#334155";
    border = "#475569";
  } else if (state === "hit") {
    bg = "#ef444433";
    border = "#ef4444";
    content = <Text style={styles.cellIcon}>{"\uD83D\uDD25"}</Text>;
  } else if (state === "miss") {
    bg = "#16213e";
    content = <View style={styles.missDot} />;
  } else if (state === "sunk") {
    bg = "#ef444444";
    border = "#ef4444";
    content = <Text style={styles.cellIcon}>{"\uD83D\uDCA5"}</Text>;
  }

  if (isLastShot) {
    border = theme.primary;
  }

  return (
    <TouchableOpacity
      style={[styles.gridCell, { width: CELL_SIZE, height: CELL_SIZE, backgroundColor: bg, borderColor: border }, extraStyle]}
      onPress={onPress}
      disabled={isMyGrid || state === "hit" || state === "miss" || state === "sunk"}
      activeOpacity={isMyGrid ? 1 : 0.7}
    >
      {content}
    </TouchableOpacity>
  );
}

function Grid({ title, cells, isMyGrid, onCellPress, theme, lastShot, shipInfoMap }) {
  const labels = "ABCDEFGH".split("");
  return (
    <View style={styles.gridWrap}>
      <Text style={styles.gridTitle}>{title}</Text>
      {/* Column labels */}
      <View style={styles.labelRow}>
        <View style={{ width: 16 }} />
        {Array.from({ length: GRID_SIZE }).map((_, i) => (
          <Text key={i} style={[styles.label, { width: CELL_SIZE }]}>{i + 1}</Text>
        ))}
      </View>
      {/* Rows */}
      {Array.from({ length: GRID_SIZE }).map((_, y) => (
        <View key={y} style={styles.gridRow}>
          <Text style={[styles.label, { width: 16, textAlign: "right", marginRight: 2 }]}>
            {labels[y]}
          </Text>
          {Array.from({ length: GRID_SIZE }).map((_, x) => {
            const isLast = lastShot && lastShot.x === x && lastShot.y === y;
            return (
              <GridCell
                key={x}
                x={x}
                y={y}
                state={cells[y]?.[x] || null}
                isMyGrid={isMyGrid}
                onPress={() => onCellPress(x, y)}
                theme={theme}
                isLastShot={isLast}
                shipInfo={shipInfoMap ? shipInfoMap[y + "," + x] : null}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}

export default function BattleshipGame({ game, playerName, onMove, theme }) {
  const isP1 = playerName.toLowerCase() === game.player1.toLowerCase();
  const opponent = isP1 ? game.player2 : game.player1;
  const isMyTurn = game.bsCurrentTurn?.toLowerCase() === playerName.toLowerCase();
  const [viewingGrid, setViewingGrid] = useState("attack"); // "attack" | "defense"

  // Build grid state from game data
  const myShips = isP1 ? game.bsShips?.p1 : game.bsShips?.p2;
  const ownShips = game.bsShips?.own; // sanitized by server
  const myShots = isP1 ? (game.bsShots?.p1 || []) : (game.bsShots?.p2 || []);
  const opponentShots = isP1 ? (game.bsShots?.p2 || []) : (game.bsShots?.p1 || []);
  const mySunk = isP1 ? (game.bsSunk?.p1 || 0) : (game.bsSunk?.p2 || 0);
  const opponentSunk = isP1 ? (game.bsSunk?.p2 || 0) : (game.bsSunk?.p1 || 0);

  // Build attack grid (opponent's waters — shows my shots)
  const attackGrid = useMemo(() => {
    const grid = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));
    for (const shot of myShots) {
      grid[shot.y][shot.x] = shot.hit ? "hit" : "miss";
    }
    return grid;
  }, [myShots]);

  // Build defense grid (my waters — shows my ships + opponent's shots)
  const { defenseGrid, defenseShipInfo } = useMemo(() => {
    const grid = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));
    const info = {};
    // Place my ships with visual metadata
    const ships = ownShips || myShips || [];
    ships.forEach((ship, idx) => {
      if (!ship.cells) return;
      const cells = ship.cells;
      const isH = cells.length > 1 ? cells[0].y === cells[1].y : true;
      const color = SHIP_COLORS[idx % SHIP_COLORS.length];
      const icon = SHIP_ICONS[idx % SHIP_ICONS.length];
      const mid = Math.floor(cells.length / 2);
      cells.forEach((cell, pos) => {
        grid[cell.y][cell.x] = "ship";
        info[cell.y + "," + cell.x] = {
          color, icon, isH,
          isStart: pos === 0,
          isEnd: pos === cells.length - 1,
          showIcon: pos === mid,
        };
      });
    });
    // Overlay opponent's shots
    for (const shot of opponentShots) {
      if (grid[shot.y][shot.x] === "ship") {
        grid[shot.y][shot.x] = "hit";
      } else {
        grid[shot.y][shot.x] = "miss";
      }
    }
    return { defenseGrid: grid, defenseShipInfo: info };
  }, [ownShips, myShips, opponentShots]);

  // Last shot for highlight
  const lastShot = myShots.length > 0 ? myShots[myShots.length - 1] : null;
  const lastOpponentShot = opponentShots.length > 0 ? opponentShots[opponentShots.length - 1] : null;

  const handleFire = useCallback((x, y) => {
    if (!isMyTurn || game.winner) return;
    // Check if already shot here
    if (myShots.some(s => s.x === x && s.y === y)) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    onMove(game.id, { x, y });
  }, [isMyTurn, game.winner, myShots, game.id, onMove]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{t("battleship")}</Text>
      <Text style={styles.vs}>{game.player1} {t("versus")} {game.player2}</Text>
      <Text style={[styles.wager, { color: theme.primary }]}>
        {t("onTheLine", { amount: game.wagerCoins.toLocaleString(), currency: theme.currencyName })}
      </Text>

      {/* Turn indicator */}
      {!game.winner && (
        <View style={[styles.turnBadge, isMyTurn && { borderColor: theme.primary, backgroundColor: theme.primary + "11" }]}>
          <Text style={[styles.turnText, isMyTurn && { color: theme.primary }]}>
            {isMyTurn ? t("fireShot") : t("aiming", { name: opponent })}
          </Text>
        </View>
      )}

      {/* Ship sunk counters */}
      <View style={styles.sunkRow}>
        <View style={styles.sunkItem}>
          <Text style={styles.sunkLabel}>{t("youSunk")}</Text>
          <Text style={[styles.sunkCount, { color: "#4ade80" }]}>{mySunk}/{game.bsTotalShips || 5}</Text>
        </View>
        <View style={styles.sunkItem}>
          <Text style={styles.sunkLabel}>{t("playerSunk", { name: opponent })}</Text>
          <Text style={[styles.sunkCount, { color: "#ef4444" }]}>{opponentSunk}/{game.bsTotalShips || 5}</Text>
        </View>
      </View>

      {/* Grid toggle */}
      <View style={styles.gridToggle}>
        <TouchableOpacity
          style={[styles.toggleBtn, viewingGrid === "attack" && { backgroundColor: theme.primary + "22", borderColor: theme.primary }]}
          onPress={() => { Haptics.selectionAsync(); setViewingGrid("attack"); }}
        >
          <Text style={[styles.toggleText, viewingGrid === "attack" && { color: theme.primary }]}>
            {"\uD83C\uDFAF"} {t("attack")}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, viewingGrid === "defense" && { backgroundColor: theme.primary + "22", borderColor: theme.primary }]}
          onPress={() => { Haptics.selectionAsync(); setViewingGrid("defense"); }}
        >
          <Text style={[styles.toggleText, viewingGrid === "defense" && { color: theme.primary }]}>
            {"\uD83D\uDEE1\uFE0F"} {t("defense")}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Grid */}
      {viewingGrid === "attack" ? (
        <Grid
          title={t("opponentWaters", { name: opponent })}
          cells={attackGrid}
          isMyGrid={false}
          onCellPress={handleFire}
          theme={theme}
          lastShot={lastShot}
        />
      ) : (
        <Grid
          title={t("yourWaters")}
          cells={defenseGrid}
          isMyGrid={true}
          onCellPress={() => {}}
          theme={theme}
          lastShot={lastOpponentShot}
          shipInfoMap={defenseShipInfo}
        />
      )}

      {/* Result */}
      {game.winner && (
        <View style={[styles.result, { borderColor: theme.primary }]}>
          <Text style={styles.resultEmoji}>
            {game.winner === "draw" ? "\uD83E\uDD1D" : game.winner.toLowerCase() === playerName.toLowerCase() ? "\u2693" : "\uD83D\uDE14"}
          </Text>
          <Text style={[styles.resultText, { color: theme.primary }]}>
            {game.winner === "draw" ? t("draw") : game.winner.toLowerCase() === playerName.toLowerCase() ? t("youWon") : t("youLost")}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 12, alignItems: "center", paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: "800", color: "#fff" },
  vs: { fontSize: 14, color: "#aaa", marginTop: 4 },
  wager: { fontSize: 16, fontWeight: "700", marginTop: 8 },
  turnBadge: {
    marginTop: 12, paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 10, borderWidth: 1, borderColor: "#333",
  },
  turnText: { fontSize: 14, fontWeight: "600", color: "#888" },
  sunkRow: { flexDirection: "row", gap: 24, marginTop: 12 },
  sunkItem: { alignItems: "center" },
  sunkLabel: { fontSize: 11, color: "#888" },
  sunkCount: { fontSize: 20, fontWeight: "800", marginTop: 2 },
  gridToggle: { flexDirection: "row", gap: 8, marginTop: 12, marginBottom: 8 },
  toggleBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center",
    borderWidth: 1, borderColor: "#333",
  },
  toggleText: { fontSize: 13, fontWeight: "600", color: "#888" },
  gridWrap: { marginTop: 4 },
  gridTitle: { fontSize: 13, fontWeight: "600", color: "#aaa", textAlign: "center", marginBottom: 4 },
  labelRow: { flexDirection: "row", marginBottom: 2 },
  label: { fontSize: 10, color: "#999", textAlign: "center", fontWeight: "600" },
  gridRow: { flexDirection: "row" },
  gridCell: {
    justifyContent: "center", alignItems: "center",
    borderWidth: 1, borderRadius: 3, margin: 1,
  },
  cellIcon: { fontSize: 16 },
  shipIcon: { fontSize: 14 },
  shipDot: { width: 8, height: 8, borderRadius: 4 },
  missDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#64748b" },
  result: {
    marginTop: 20, padding: 20, borderRadius: 16,
    borderWidth: 2, alignItems: "center", width: "100%",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  resultEmoji: { fontSize: 48 },
  resultText: { fontSize: 24, fontWeight: "800", marginTop: 8 },
});
