// Hangman — guess letters to reveal the word, fewer wrong guesses wins
// Both players guess the same word simultaneously. Whoever finishes
// with fewer wrong guesses (or finishes first if tied) wins.
import React, { useState, useCallback, useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import * as Haptics from "expo-haptics";
import t from "../../lib/i18n";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const MAX_WRONG = 6;

// ASCII stick figure parts
const HANGMAN_PARTS = [
  "  O  ",   // head
  "  |  ",   // body
  " /|  ",   // left arm
  " /|\\ ",  // right arm
  " /   ",   // left leg
  " / \\ ",  // right leg
];

export default function HangmanGame({ game, playerName, onMove, theme }) {
  const isP1 = playerName.toLowerCase() === game.player1.toLowerCase();
  const myGuesses = isP1 ? (game.hangmanP1Guesses || []) : (game.hangmanP2Guesses || []);
  const myWrong = isP1 ? (game.hangmanP1Wrong || 0) : (game.hangmanP2Wrong || 0);
  const opponentWrong = isP1 ? (game.hangmanP2Wrong || 0) : (game.hangmanP1Wrong || 0);
  const opponent = isP1 ? game.player2 : game.player1;
  const word = game.hangmanWord || "";

  // Build the display word with blanks
  const displayWord = useMemo(() => {
    return word.split("").map(letter => {
      if (letter === " ") return " ";
      return myGuesses.includes(letter.toUpperCase()) ? letter : "_";
    }).join(" ");
  }, [word, myGuesses]);

  // Check if word is fully revealed
  const wordComplete = useMemo(() => {
    return word.split("").every(letter =>
      letter === " " || myGuesses.includes(letter.toUpperCase())
    );
  }, [word, myGuesses]);

  const handleGuess = useCallback((letter) => {
    if (myGuesses.includes(letter) || game.winner || myWrong >= MAX_WRONG || wordComplete) return;
    const isCorrect = word.toUpperCase().includes(letter);
    Haptics.impactAsync(isCorrect ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Heavy);
    onMove(game.id, letter);
  }, [myGuesses, game.winner, myWrong, wordComplete, word, game.id, onMove]);

  // Hangman figure based on wrong guesses
  const figure = useMemo(() => {
    const lines = ["  ___  ", " |   | ", " |     ", " |     ", " |     ", " |     ", "_|___  "];
    const parts = HANGMAN_PARTS.slice(0, myWrong);
    if (parts.length > 0) lines[2] = " |" + (parts[0] || "     ");
    if (parts.length > 1) lines[3] = " |" + (parts[1] || "     ");
    if (parts.length > 2) lines[3] = " |" + (parts[2] || "     ");
    if (parts.length > 3) lines[3] = " |" + (parts[3] || "     ");
    if (parts.length > 4) lines[4] = " |" + (parts[4] || "     ");
    if (parts.length > 5) lines[4] = " |" + (parts[5] || "     ");
    return lines;
  }, [myWrong]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{t("hangman")}</Text>
      <Text style={styles.vs}>{game.player1} {t("versus")} {game.player2}</Text>
      <Text style={[styles.wager, { color: theme.primary }]}>
        {t("onTheLine", { amount: game.wagerCoins.toLocaleString(), currency: theme.currencyName })}
      </Text>

      {/* Hangman figure */}
      <View style={styles.figureWrap}>
        {figure.map((line, i) => (
          <Text key={i} style={[styles.figureLine, myWrong >= MAX_WRONG && { color: "#ef4444" }]}>
            {line}
          </Text>
        ))}
      </View>

      {/* Wrong guess count */}
      <View style={styles.wrongRow}>
        <Text style={styles.wrongLabel}>{t("wrongGuesses")}</Text>
        <View style={styles.wrongDots}>
          {Array.from({ length: MAX_WRONG }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.wrongDot,
                i < myWrong && { backgroundColor: "#ef4444" },
              ]}
            />
          ))}
        </View>
        <Text style={styles.wrongCount}>{myWrong}/{MAX_WRONG}</Text>
      </View>

      {/* Word display */}
      <View style={styles.wordWrap}>
        <Text style={[styles.wordText, { color: theme.primary }]}>{displayWord}</Text>
      </View>

      {/* Keyboard */}
      {!game.winner && myWrong < MAX_WRONG && !wordComplete && (
        <View style={styles.keyboard}>
          {ALPHABET.map((letter) => {
            const guessed = myGuesses.includes(letter);
            const isCorrect = guessed && word.toUpperCase().includes(letter);
            const isWrong = guessed && !word.toUpperCase().includes(letter);
            return (
              <TouchableOpacity
                key={letter}
                style={[
                  styles.key,
                  isCorrect && { backgroundColor: "#4ade80" + "33", borderColor: "#4ade80" },
                  isWrong && { backgroundColor: "#ef4444" + "22", borderColor: "#ef4444", opacity: 0.5 },
                  !guessed && { borderColor: theme.primary + "44" },
                ]}
                onPress={() => handleGuess(letter)}
                disabled={guessed}
              >
                <Text style={[
                  styles.keyText,
                  isCorrect && { color: "#4ade80" },
                  isWrong && { color: "#ef4444" },
                  !guessed && { color: "#ccc" },
                ]}>
                  {letter}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Opponent progress */}
      <View style={styles.opponentCard}>
        <Text style={styles.opponentLabel}>{t("opponentProgress", { name: opponent })}</Text>
        <View style={styles.wrongDots}>
          {Array.from({ length: MAX_WRONG }).map((_, i) => (
            <View key={i} style={[styles.wrongDot, i < opponentWrong && { backgroundColor: "#ef4444" }]} />
          ))}
        </View>
        <Text style={styles.opponentWrong}>{t("wrongOutOf", { count: opponentWrong, max: MAX_WRONG })}</Text>
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
          <Text style={styles.resultWord}>{t("wordWas", { word })}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, alignItems: "center", paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: "800", color: "#fff" },
  vs: { fontSize: 14, color: "#aaa", marginTop: 4 },
  wager: { fontSize: 16, fontWeight: "700", marginTop: 8 },
  figureWrap: { marginTop: 16, backgroundColor: "#0a1628", borderRadius: 12, padding: 12, minWidth: 120 },
  figureLine: { fontFamily: "Courier", fontSize: 18, color: "#888", textAlign: "center", lineHeight: 22 },
  wrongRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  wrongLabel: { fontSize: 12, color: "#888" },
  wrongDots: { flexDirection: "row", gap: 4 },
  wrongDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#333" },
  wrongCount: { fontSize: 12, color: "#888", fontWeight: "600" },
  wordWrap: { marginTop: 20, padding: 16, backgroundColor: "#16213e", borderRadius: 12, minWidth: "80%" },
  wordText: { fontSize: 28, fontWeight: "800", textAlign: "center", letterSpacing: 4 },
  keyboard: {
    flexDirection: "row", flexWrap: "wrap", justifyContent: "center",
    gap: 5, marginTop: 20, maxWidth: 320,
  },
  key: {
    width: 36, height: 40, borderRadius: 8,
    justifyContent: "center", alignItems: "center",
    backgroundColor: "#16213e", borderWidth: 1, borderColor: "#333",
  },
  keyText: { fontSize: 14, fontWeight: "700" },
  opponentCard: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginTop: 16, padding: 10, backgroundColor: "#16213e",
    borderRadius: 10, width: "100%",
  },
  opponentLabel: { fontSize: 12, color: "#888", flex: 1 },
  opponentWrong: { fontSize: 12, color: "#888", fontWeight: "600" },
  result: {
    marginTop: 20, padding: 20, borderRadius: 16,
    borderWidth: 2, alignItems: "center", width: "100%",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  resultEmoji: { fontSize: 48 },
  resultText: { fontSize: 24, fontWeight: "800", marginTop: 8 },
  resultWord: { fontSize: 14, color: "#aaa", marginTop: 8, fontStyle: "italic" },
});
