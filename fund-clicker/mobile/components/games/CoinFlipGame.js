// Coin Flip — 50/50 luck game with animated coin
import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated, Easing } from "react-native";
import * as Haptics from "../../lib/haptics";
import t from "../../lib/i18n";

export default function CoinFlipGame({ game, playerName, theme }) {
  const flipAnim = useRef(new Animated.Value(0)).current;
  const resultShown = useRef(false);

  useEffect(() => {
    // Animate the coin flip
    Animated.sequence([
      Animated.timing(flipAnim, {
        toValue: 6, // 6 full rotations
        duration: 2500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (!resultShown.current) {
        resultShown.current = true;
        const won = game.winner?.toLowerCase() === playerName.toLowerCase();
        Haptics.notificationAsync(
          won ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error
        );
      }
    });
  }, []);

  const spin = flipAnim.interpolate({
    inputRange: [0, 6],
    outputRange: ["0deg", "2160deg"],
  });

  const scale = flipAnim.interpolate({
    inputRange: [0, 1, 3, 5, 6],
    outputRange: [1, 1.3, 1.5, 1.2, 1],
  });

  const won = game.winner?.toLowerCase() === playerName.toLowerCase();
  const isDraw = game.winner === "draw";
  const flipResult = game.coinFlipResult === "heads"
    ? t("heads")
    : game.coinFlipResult === "tails"
      ? t("tails")
      : "...";

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t("coinFlip")}</Text>
      <Text style={styles.vs}>{game.player1} {t("versus")} {game.player2}</Text>
      <Text style={[styles.wager, { color: theme.primary }]}>
        {t("onTheLine", { amount: game.wagerCoins.toLocaleString(), currency: theme.currencyName })}
      </Text>

      {/* Animated coin */}
      <Animated.View
        style={[
          styles.coin,
          {
            backgroundColor: game.coinFlipResult === "heads" ? "#FFD700" : "#C0C0C0",
            transform: [{ rotateY: spin }, { scale }],
          },
        ]}
      >
        <Text style={styles.coinText}>
          {game.coinFlipResult === "heads" ? "H" : "T"}
        </Text>
      </Animated.View>

      <Text style={styles.flipResult}>
        {flipResult}
      </Text>

      {/* Result */}
      {game.winner && (
        <View style={[styles.result, { borderColor: theme.primary }]}>
          <Text style={styles.resultEmoji}>
            {isDraw ? "\uD83E\uDD1D" : won ? "\uD83C\uDFC6" : "\uD83D\uDE14"}
          </Text>
          <Text style={[styles.resultText, { color: theme.primary }]}>
            {isDraw ? t("draw") : won ? t("youWon") : t("youLost")}
          </Text>
          <Text style={styles.resultSub}>
            {isDraw
              ? t("currencyAmount", { amount: 0, currency: theme.currencyName })
              : t("signedCurrencyAmount", {
                sign: won ? "+" : "-",
                amount: game.wagerCoins,
                currency: theme.currencyName,
              })}
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
  coin: {
    width: 120, height: 120, borderRadius: 60,
    justifyContent: "center", alignItems: "center",
    marginTop: 40,
    shadowColor: "#FFD700", shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5, shadowRadius: 20, elevation: 10,
  },
  coinText: { fontSize: 48, fontWeight: "900", color: "#1a1a2e" },
  flipResult: {
    fontSize: 18, fontWeight: "700", color: "#888",
    marginTop: 16, textTransform: "uppercase", letterSpacing: 3,
  },
  result: {
    marginTop: 32, padding: 20, borderRadius: 16,
    borderWidth: 2, alignItems: "center", width: "100%",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  resultEmoji: { fontSize: 48 },
  resultText: { fontSize: 24, fontWeight: "800", marginTop: 8 },
  resultSub: { fontSize: 14, color: "#aaa", marginTop: 4 },
});
