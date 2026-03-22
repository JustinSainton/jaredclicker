// Reaction Race — fastest tap after the signal wins
import React, { useState, useEffect, useRef, useCallback } from "react";
import { View, Text, Pressable, StyleSheet, Animated } from "react-native";
import * as Haptics from "expo-haptics";
import t from "../../lib/i18n";

export default function ReactionGame({ game, playerName, onMove, theme }) {
  const isP1 = playerName.toLowerCase() === game.player1.toLowerCase();
  const opponent = isP1 ? game.player2 : game.player1;
  const myTap = isP1 ? game.reactionP1Tap : game.reactionP2Tap;
  const opponentTap = isP1 ? game.reactionP2Tap : game.reactionP1Tap;
  const myFalseStart = isP1 ? game.reactionP1FalseStart : game.reactionP2FalseStart;
  const opponentFalseStart = isP1 ? game.reactionP2FalseStart : game.reactionP1FalseStart;

  const [phase, setPhase] = useState("wait"); // wait | ready | go | tapped | falsestart
  const [localTime, setLocalTime] = useState(null);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const goTime = useRef(game.reactionGoAt);

  // Track phase based on time
  useEffect(() => {
    if (game.winner) {
      setPhase("done");
      return;
    }
    if (myFalseStart) {
      setPhase("falsestart");
      return;
    }
    if (myTap !== null && myTap !== undefined) {
      setPhase("tapped");
      setLocalTime(myTap);
      return;
    }

    const goAt = game.reactionGoAt;
    const now = Date.now();

    if (now >= goAt) {
      setPhase("go");
    } else {
      setPhase("ready");
      const timer = setTimeout(() => {
        setPhase("go");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }, goAt - now);
      return () => clearTimeout(timer);
    }
  }, [game.winner, myFalseStart, myTap, game.reactionGoAt]);

  const handleTap = useCallback(() => {
    if (phase === "tapped" || phase === "done" || phase === "falsestart") return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    onMove(game.id, "tap");

    if (phase === "ready") {
      setPhase("falsestart");
    } else if (phase === "go") {
      const reactionMs = Date.now() - goTime.current;
      setLocalTime(reactionMs);
      setPhase("tapped");
    }

    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.8, duration: 50, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 3, useNativeDriver: true }),
    ]).start();
  }, [phase, game.id, onMove, scaleAnim]);

  const getColor = () => {
    switch (phase) {
      case "ready": return "#ef4444"; // red — DON'T tap
      case "go": return "#4ade80"; // green — TAP NOW
      case "falsestart": return "#f97316"; // orange
      case "tapped": return theme.primary;
      default: return "#333";
    }
  };

  const getMessage = () => {
    switch (phase) {
      case "wait": return t("getReady");
      case "ready": return t("waitDontTap");
      case "go": return t("tapNow");
      case "tapped": return `${localTime}ms`;
      case "falsestart": return t("tooEarly");
      case "done": return "";
      default: return "";
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t("reactionRace")}</Text>
      <Text style={styles.vs}>{game.player1} {t("versus")} {game.player2}</Text>
      <Text style={[styles.wager, { color: theme.primary }]}>
        {t("onTheLine", { amount: game.wagerCoins.toLocaleString(), currency: theme.currencyName })}
      </Text>

      {/* Instruction */}
      <Text style={styles.instruction}>
        {phase === "ready" ? t("waitForGreen") :
         phase === "go" ? t("goGoGo") : ""}
      </Text>

      {/* Tap target */}
      {phase !== "done" && (
        <Pressable onPressIn={handleTap}>
          <Animated.View style={[
            styles.tapTarget,
            { backgroundColor: getColor(), transform: [{ scale: scaleAnim }] },
          ]}>
            <Text style={styles.tapMessage}>{getMessage()}</Text>
            {phase === "ready" && <Text style={styles.tapSub}>{t("dontTapYet")}</Text>}
            {phase === "go" && <Text style={styles.tapSub}>{t("tap")}</Text>}
          </Animated.View>
        </Pressable>
      )}

      {/* Results comparison */}
      {(phase === "tapped" || phase === "done") && (
        <View style={styles.comparison}>
          <View style={styles.compPlayer}>
            <Text style={[styles.compName, isP1 && { color: theme.primary }]}>{t("you")}</Text>
            <Text style={styles.compTime}>
              {myFalseStart ? t("falseStart") : myTap !== null ? `${myTap}ms` : t("waitingEllipsis")}
            </Text>
          </View>
          <Text style={styles.compVs}>{t("versus")}</Text>
          <View style={styles.compPlayer}>
            <Text style={styles.compName}>{opponent}</Text>
            <Text style={styles.compTime}>
              {opponentFalseStart ? t("falseStart") :
               opponentTap !== null ? `${opponentTap}ms` : t("waitingEllipsis")}
            </Text>
          </View>
        </View>
      )}

      {/* Final result */}
      {game.winner && (
        <View style={[styles.result, { borderColor: theme.primary }]}>
          <Text style={styles.resultEmoji}>
            {game.winner === "draw" ? "\uD83E\uDD1D" : game.winner.toLowerCase() === playerName.toLowerCase() ? "\u26A1" : "\uD83D\uDE14"}
          </Text>
          <Text style={[styles.resultText, { color: theme.primary }]}>
            {game.winner === "draw" ? t("draw") : game.winner.toLowerCase() === playerName.toLowerCase() ? t("lightningFast") : t("tooSlow")}
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
  instruction: { fontSize: 14, color: "#888", marginTop: 16, textAlign: "center" },
  tapTarget: {
    width: 200, height: 200, borderRadius: 100,
    justifyContent: "center", alignItems: "center",
    marginTop: 32,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5, shadowRadius: 30, elevation: 15,
  },
  tapMessage: { fontSize: 28, fontWeight: "900", color: "#fff" },
  tapSub: { fontSize: 14, color: "rgba(255,255,255,0.7)", marginTop: 4, fontWeight: "600" },
  comparison: { flexDirection: "row", alignItems: "center", gap: 20, marginTop: 24, width: "100%" },
  compPlayer: { flex: 1, alignItems: "center" },
  compName: { fontSize: 14, color: "#aaa", fontWeight: "600" },
  compTime: { fontSize: 24, fontWeight: "800", color: "#fff", marginTop: 4 },
  compVs: { fontSize: 14, color: "#666" },
  result: {
    marginTop: 24, padding: 20, borderRadius: 16,
    borderWidth: 2, alignItems: "center", width: "100%",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  resultEmoji: { fontSize: 48 },
  resultText: { fontSize: 24, fontWeight: "800", marginTop: 8 },
});
