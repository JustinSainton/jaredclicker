// Trivia — speed + knowledge battle
import React, { useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import t from "../../lib/i18n";

export default function TriviaGame({ game, playerName, onMove, theme }) {
  const isP1 = playerName.toLowerCase() === game.player1.toLowerCase();
  const myAnswer = isP1 ? game.triviaP1Answer : game.triviaP2Answer;
  const answered = myAnswer !== null && myAnswer !== undefined;
  const [elapsed, setElapsed] = useState(0);

  // Timer
  useEffect(() => {
    if (answered || game.winner) return;
    const start = game.triviaStartedAt;
    const interval = setInterval(() => {
      setElapsed(((Date.now() - start) / 1000).toFixed(1));
    }, 100);
    return () => clearInterval(interval);
  }, [answered, game.winner, game.triviaStartedAt]);

  const handleAnswer = useCallback((index) => {
    if (answered) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onMove(game.id, index);
  }, [answered, game.id, onMove]);

  const opponent = isP1 ? game.player2 : game.player1;
  const correctIndex = game.triviaCorrectIndex;
  const showResults = game.winner !== null && game.winner !== undefined;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t("trivia")}</Text>
      <Text style={styles.vs}>{game.player1} {t("versus")} {game.player2}</Text>
      <Text style={[styles.wager, { color: theme.primary }]}>
        {t("currencyAmount", { amount: game.wagerCoins.toLocaleString(), currency: theme.currencyName })}
      </Text>

      {/* Timer */}
      {!answered && !game.winner && (
        <Text style={styles.timer}>{elapsed}s</Text>
      )}

      {/* Question */}
      <View style={styles.questionCard}>
        <Text style={styles.question}>{game.triviaQuestion}</Text>
      </View>

      {/* Answer options */}
      <View style={styles.answers}>
        {game.triviaAnswers.map((answer, index) => {
          let style = styles.answerBtn;
          let textStyle = styles.answerText;

          if (showResults) {
            if (index === correctIndex) {
              style = [styles.answerBtn, styles.answerCorrect];
              textStyle = [styles.answerText, { color: "#fff" }];
            } else if (index === myAnswer && index !== correctIndex) {
              style = [styles.answerBtn, styles.answerWrong];
              textStyle = [styles.answerText, { color: "#fff" }];
            }
          } else if (index === myAnswer) {
            style = [styles.answerBtn, { borderColor: theme.primary, backgroundColor: theme.primary + "22" }];
            textStyle = [styles.answerText, { color: theme.primary }];
          }

          return (
            <TouchableOpacity
              key={index}
              style={style}
              onPress={() => handleAnswer(index)}
              disabled={answered || !!game.winner}
            >
              <Text style={styles.answerLetter}>
                {String.fromCharCode(65 + index)}
              </Text>
              <Text style={textStyle}>{answer}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Waiting */}
      {answered && !game.winner && (
        <Text style={styles.waiting}>{t("waitingForPlayer", { name: opponent })}</Text>
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
  timer: { fontSize: 20, fontWeight: "700", color: "#FFD700", marginTop: 12, fontVariant: ["tabular-nums"] },
  questionCard: {
    backgroundColor: "#16213e", borderRadius: 16,
    padding: 24, width: "100%", marginTop: 20,
    borderWidth: 1, borderColor: "#333",
  },
  question: { fontSize: 18, fontWeight: "600", color: "#fff", textAlign: "center", lineHeight: 26 },
  answers: { width: "100%", marginTop: 16, gap: 10 },
  answerBtn: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "#16213e", borderRadius: 12,
    padding: 16, borderWidth: 1, borderColor: "#333",
  },
  answerCorrect: { borderColor: "#4ade80", backgroundColor: "rgba(74,222,128,0.2)" },
  answerWrong: { borderColor: "#ef4444", backgroundColor: "rgba(239,68,68,0.2)" },
  answerLetter: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: "#333", color: "#fff",
    textAlign: "center", lineHeight: 28,
    fontSize: 13, fontWeight: "700",
  },
  answerText: { fontSize: 15, color: "#ccc", flex: 1, fontWeight: "500" },
  waiting: { fontSize: 14, color: "#888", marginTop: 20, fontStyle: "italic" },
  result: {
    marginTop: 24, padding: 20, borderRadius: 16,
    borderWidth: 2, alignItems: "center", width: "100%",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  resultEmoji: { fontSize: 48 },
  resultText: { fontSize: 24, fontWeight: "800", marginTop: 8 },
});
