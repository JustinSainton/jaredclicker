// ActiveGameModal — renders incoming challenges and active battle games
// Wired into GameContext: pendingChallenge, currentGame, gameResult
import React from "react";
import { View, Text, Modal, TouchableOpacity, StyleSheet, Alert } from "react-native";
import * as Haptics from "../../lib/haptics";
import { useGame } from "../../context/GameContext";
import { useOrg } from "../../context/OrgContext";
import RPSGame from "./RPSGame";
import ClickerDuelGame from "./ClickerDuelGame";
import TriviaGame from "./TriviaGame";
import CoinFlipGame from "./CoinFlipGame";
import TTTGame from "./TTTGame";
import ReactionGame from "./ReactionGame";
import Connect4Game from "./Connect4Game";
import HangmanGame from "./HangmanGame";
import BattleshipGame from "./BattleshipGame";
import t from "../../lib/i18n";

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

export default function ActiveGameModal() {
  const {
    player, pendingChallenge, currentGame, gameResult,
    acceptChallenge, declineChallenge, sendGameMove, dismissGame,
  } = useGame();
  const { theme } = useOrg();
  const getGameName = (type) => (GAME_NAME_KEYS[type] ? t(GAME_NAME_KEYS[type]) : type);

  const renderGame = () => {
    if (!currentGame || !player?.name) return null;

    const commonProps = {
      game: currentGame,
      playerName: player.name,
      onMove: sendGameMove,
      theme,
    };

    switch (currentGame.type) {
      case "rps": return <RPSGame {...commonProps} />;
      case "clickerduel": return <ClickerDuelGame {...commonProps} />;
      case "trivia": return <TriviaGame {...commonProps} />;
      case "coinflip": return <CoinFlipGame {...commonProps} />;
      case "ttt": return <TTTGame {...commonProps} />;
      case "reaction": return <ReactionGame {...commonProps} />;
      case "connect4": return <Connect4Game {...commonProps} />;
      case "hangman": return <HangmanGame {...commonProps} />;
      case "battleship": return <BattleshipGame {...commonProps} />;
      default:
        return (
          <View style={styles.unsupported}>
            <Text style={styles.unsupportedEmoji}>{"\uD83C\uDFAE"}</Text>
            <Text style={styles.unsupportedText}>{getGameName(currentGame.type)}</Text>
            <Text style={styles.unsupportedHint}>{t("gameTypeComingSoon")}</Text>
          </View>
        );
    }
  };

  return (
    <>
      {/* ── Incoming Challenge Modal ────────────────────────────────── */}
      <Modal transparent visible={!!pendingChallenge} animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.challengeCard}>
            <Text style={styles.challengeEmoji}>{"\u2694\uFE0F"}</Text>
            <Text style={styles.challengeTitle}>{t("battleChallenge")}</Text>
            <Text style={styles.challengeFrom}>
              <Text style={{ fontWeight: "800", color: "#fff" }}>
                {pendingChallenge?.challengerName}
              </Text>
              {" "}
              {t("wantsToPlay")}
            </Text>
            <Text style={[styles.challengeGame, { color: theme.primary }]}>
              {getGameName(pendingChallenge?.gameType)}
            </Text>
            <View style={styles.challengeWagerRow}>
              <Text style={styles.challengeWagerLabel}>{t("wager")}:</Text>
              <Text style={[styles.challengeWager, { color: theme.primary }]}>
                {t("currencyAmount", {
                  amount: pendingChallenge?.wagerCoins?.toLocaleString() || 0,
                  currency: theme.currencyName,
                })}
              </Text>
            </View>
            <View style={styles.challengeButtons}>
              <TouchableOpacity
                style={styles.declineBtn}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  declineChallenge(pendingChallenge?.id);
                }}
              >
                <Text style={styles.declineBtnText}>{t("decline")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.acceptBtn, { backgroundColor: theme.primary }]}
                onPress={() => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  acceptChallenge(pendingChallenge?.id);
                }}
              >
                <Text style={[styles.acceptBtnText, { color: theme.secondary }]}>{t("accept")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Active Game Modal ──────────────────────────────────────── */}
      <Modal transparent visible={!!currentGame} animationType="slide">
        <View style={styles.gameOverlay}>
          <View style={styles.gameContainer}>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => {
                if (currentGame?.winner || currentGame?._ended) {
                  dismissGame();
                } else {
                  Alert.alert(
                    t("leaveGame"),
                    t("forfeitWarning"),
                    [
                      { text: t("stay"), style: "cancel" },
                      {
                        text: t("forfeitAndLeave"),
                        style: "destructive",
                        onPress: () => {
                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                          dismissGame();
                        },
                      },
                    ],
                  );
                }
              }}
            >
              <Text style={styles.closeBtnText}>{"\u2715"}</Text>
            </TouchableOpacity>
            {renderGame()}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // Overlay
  overlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center", alignItems: "center", padding: 24,
  },
  // Challenge card
  challengeCard: {
    backgroundColor: "#16213e", borderRadius: 24, padding: 32,
    alignItems: "center", width: "100%", maxWidth: 340,
    borderWidth: 1, borderColor: "#333",
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5, shadowRadius: 20, elevation: 20,
  },
  challengeEmoji: { fontSize: 56, marginBottom: 16 },
  challengeTitle: { fontSize: 24, fontWeight: "900", color: "#fff" },
  challengeFrom: { fontSize: 15, color: "#aaa", marginTop: 12, textAlign: "center" },
  challengeGame: { fontSize: 20, fontWeight: "700", marginTop: 8 },
  challengeWagerRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  challengeWagerLabel: { fontSize: 14, color: "#888" },
  challengeWager: { fontSize: 20, fontWeight: "800" },
  challengeButtons: { flexDirection: "row", gap: 12, marginTop: 28, width: "100%" },
  declineBtn: {
    flex: 1, padding: 15, borderRadius: 14,
    backgroundColor: "#333", alignItems: "center",
  },
  declineBtnText: { fontSize: 16, fontWeight: "600", color: "#aaa" },
  acceptBtn: {
    flex: 1.5, padding: 15, borderRadius: 14, alignItems: "center",
  },
  acceptBtnText: { fontSize: 16, fontWeight: "800" },
  // Game container
  gameOverlay: {
    flex: 1, backgroundColor: "#0a0a14",
    justifyContent: "flex-start",
  },
  gameContainer: {
    flex: 1, paddingTop: 60,
  },
  closeBtn: {
    position: "absolute", top: 54, right: 20, zIndex: 10,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.1)",
    justifyContent: "center", alignItems: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.15)",
  },
  closeBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  // Unsupported game type
  unsupported: { alignItems: "center", padding: 40, flex: 1, justifyContent: "center" },
  unsupportedEmoji: { fontSize: 72 },
  unsupportedText: { fontSize: 22, color: "#fff", fontWeight: "700", marginTop: 20 },
  unsupportedHint: { fontSize: 14, color: "#888", marginTop: 8 },
});
