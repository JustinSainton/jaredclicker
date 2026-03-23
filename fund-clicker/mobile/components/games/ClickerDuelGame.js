// Clicker Duel — 10-second tap battle
import React, { useState, useEffect, useRef, useCallback } from "react";
import { View, Text, Pressable, StyleSheet, Animated } from "react-native";
import * as Haptics from "../../lib/haptics";
import t from "../../lib/i18n";

export default function ClickerDuelGame({ game, playerName, onMove, theme }) {
  const isP1 = playerName.toLowerCase() === game.player1.toLowerCase();
  const myTaps = isP1 ? game.cdP1Taps : game.cdP2Taps;
  const opponentTaps = isP1 ? game.cdP2Taps : game.cdP1Taps;
  const opponent = isP1 ? game.player2 : game.player1;

  const started = game.cdStartAt && game.cdStartAt > 0;
  const ended = game.winner || (game.cdEndAt && Date.now() > game.cdEndAt);
  const [timeLeft, setTimeLeft] = useState(10);
  const [countdown, setCountdown] = useState(started ? 0 : game.cdCountdown || 3);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // Countdown timer
  useEffect(() => {
    if (!started && countdown > 0) {
      const timer = setInterval(() => {
        setCountdown((prev) => Math.max(0, prev - 1));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [started, countdown]);

  // Game timer
  useEffect(() => {
    if (!started || ended) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, (game.cdEndAt - Date.now()) / 1000);
      setTimeLeft(remaining);
    }, 100);
    return () => clearInterval(interval);
  }, [started, ended, game.cdEndAt]);

  const handleTap = useCallback(() => {
    if (!started || ended) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onMove(game.id, "tap");

    // Bounce animation
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.85, duration: 30, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 3, tension: 300, useNativeDriver: true }),
    ]).start();
  }, [started, ended, game.id, onMove, scaleAnim]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t("clickerDuel")}</Text>
      <Text style={styles.vs}>{game.player1} {t("versus")} {game.player2}</Text>
      <Text style={[styles.wager, { color: theme.primary }]}>
        {t("onTheLine", { amount: game.wagerCoins.toLocaleString(), currency: theme.currencyName })}
      </Text>

      {/* Countdown: 3...2...1...GO! */}
      {!started && (
        <View style={styles.countdownWrap}>
          <Text style={styles.countdownNum}>
            {countdown > 0 ? countdown : t("go")}
          </Text>
          <Text style={styles.countdownLabel}>
            {countdown > 0 ? t("getReady") : t("waitingForServer")}
          </Text>
        </View>
      )}

      {/* Timer */}
      {started && !ended && (
        <View style={styles.timerRow}>
          <View style={styles.timerBar}>
            <View style={[styles.timerFill, { width: (timeLeft / 10 * 100) + "%", backgroundColor: theme.primary }]} />
          </View>
          <Text style={styles.timerText}>{timeLeft.toFixed(1)}s</Text>
        </View>
      )}

      {/* Tap button */}
      {started && !ended && (
        <Pressable onPressIn={handleTap}>
          <Animated.View style={[styles.tapButton, { backgroundColor: theme.primary, transform: [{ scale: scaleAnim }] }]}>
            <Text style={styles.tapEmoji}>{"\uD83D\uDCA8"}</Text>
            <Text style={styles.tapCount}>{myTaps}</Text>
            <Text style={styles.tapLabel}>{t("tapLabelUpper")}</Text>
          </Animated.View>
        </Pressable>
      )}

      {/* Score comparison */}
      {started && (
        <View style={styles.scoreRow}>
          <View style={styles.scoreBlock}>
            <Text style={[styles.scoreName, isP1 && { color: theme.primary }]}>{t("you")}</Text>
            <Text style={styles.scoreNum}>{myTaps}</Text>
          </View>
          <Text style={styles.scoreDivider}>{t("versus")}</Text>
          <View style={styles.scoreBlock}>
            <Text style={styles.scoreName}>{opponent}</Text>
            <Text style={styles.scoreNum}>{opponentTaps}</Text>
          </View>
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
          <Text style={styles.resultSub}>
            {t("tapCountComparison", { mine: myTaps, theirs: opponentTaps })}
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
  countdownWrap: { alignItems: "center", marginTop: 40 },
  countdownNum: { fontSize: 80, fontWeight: "900", color: "#FFD700" },
  countdownLabel: { fontSize: 16, color: "#888", marginTop: 8 },
  timerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 20, width: "100%" },
  timerBar: { flex: 1, height: 6, backgroundColor: "#333", borderRadius: 3, overflow: "hidden" },
  timerFill: { height: "100%", borderRadius: 3 },
  timerText: { fontSize: 16, fontWeight: "700", color: "#fff", fontVariant: ["tabular-nums"], width: 50 },
  tapButton: {
    width: 180, height: 180, borderRadius: 90,
    justifyContent: "center", alignItems: "center",
    marginTop: 24,
    shadowColor: "#FFD700", shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4, shadowRadius: 20, elevation: 10,
  },
  tapEmoji: { fontSize: 40 },
  tapCount: { fontSize: 36, fontWeight: "900", color: "#1a1a2e", marginTop: 4 },
  tapLabel: { fontSize: 10, fontWeight: "800", color: "#1a1a2e", letterSpacing: 2 },
  scoreRow: { flexDirection: "row", alignItems: "center", gap: 20, marginTop: 24 },
  scoreBlock: { alignItems: "center", flex: 1 },
  scoreName: { fontSize: 13, color: "#aaa", fontWeight: "600" },
  scoreNum: { fontSize: 28, fontWeight: "900", color: "#fff", marginTop: 4 },
  scoreDivider: { fontSize: 14, color: "#666", fontWeight: "700" },
  result: {
    marginTop: 24, padding: 20, borderRadius: 16,
    borderWidth: 2, alignItems: "center", width: "100%",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  resultEmoji: { fontSize: 48 },
  resultText: { fontSize: 24, fontWeight: "800", marginTop: 8 },
  resultSub: { fontSize: 14, color: "#aaa", marginTop: 4 },
});
