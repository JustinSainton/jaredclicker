// Live Activities (iOS 16.1+) — shows real-time game state on Lock Screen + Dynamic Island
// Uses expo-live-activity (Software Mansion) — zero Swift code needed
//
// Shows:
// 1. During active battles: game type, players, wager, progress
// 2. During fundraiser events: total raised, player count, progress to goal

import { Platform } from "react-native";

let LiveActivity = null;
if (Platform.OS === "ios") {
  try {
    LiveActivity = require("expo-live-activity");
  } catch {}
}

class LiveActivityManager {
  constructor() {
    this.currentActivityId = null;
    this.supported = Platform.OS === "ios" && !!LiveActivity;
  }

  async areActivitiesEnabled() {
    if (!this.supported) return false;
    try {
      return LiveActivity.areActivitiesEnabled();
    } catch {
      return false;
    }
  }

  // Start a Live Activity for an active battle
  async startBattleActivity({ gameType, player1, player2, wagerCoins, duration }) {
    if (!this.supported) return null;
    try {
      const gameNames = {
        rps: "Rock Paper Scissors", clickerduel: "Clicker Duel", trivia: "Trivia",
        coinflip: "Coin Flip", ttt: "Tic-Tac-Toe", reaction: "Reaction Race",
        connect4: "Connect 4", hangman: "Hangman", battleship: "Battleship",
      };
      const state = {
        title: gameNames[gameType] || gameType,
        subtitle: player1 + " vs " + player2 + " \u2022 " + (wagerCoins || 0).toLocaleString() + " coins",
      };
      if (duration) {
        state.progressBar = { date: Date.now() + duration };
      }
      const config = {
        backgroundColor: "#1a1a2e",
        titleColor: "#FFD700",
        subtitleColor: "#93C5FD",
        padding: 14,
      };
      const activityId = LiveActivity.startActivity(state, config);
      this.currentActivityId = activityId;
      console.log("[LiveActivity] Started battle:", activityId);
      return activityId;
    } catch (e) {
      console.warn("[LiveActivity] Failed to start:", e);
      return null;
    }
  }

  // Update the Live Activity with new scores
  async updateBattleActivity({ player1Score, player2Score, status, winner }) {
    if (!this.supported || !this.currentActivityId) return;
    try {
      const subtitle = winner
        ? (winner + " wins!")
        : ("Score: " + player1Score + " - " + player2Score);
      LiveActivity.updateActivity(this.currentActivityId, {
        subtitle,
      });
    } catch (e) {
      console.warn("[LiveActivity] Failed to update:", e);
    }
  }

  // End the Live Activity
  async endBattleActivity({ winner, finalMessage }) {
    if (!this.supported || !this.currentActivityId) return;
    try {
      LiveActivity.stopActivity(this.currentActivityId, {
        title: finalMessage || "Game Over",
        subtitle: winner ? (winner + " wins!") : "Game ended",
      });
      console.log("[LiveActivity] Ended battle");
      this.currentActivityId = null;
    } catch (e) {
      console.warn("[LiveActivity] Failed to end:", e);
    }
  }

  // Start a fundraiser progress Live Activity
  async startFundraiserActivity({ orgName, totalRaisedCents, goalCents, playerRank, playerCount }) {
    if (!this.supported) return null;
    try {
      const raised = (totalRaisedCents / 100).toFixed(2);
      const goal = goalCents ? (goalCents / 100).toFixed(0) : null;
      const state = {
        title: orgName,
        subtitle: "$" + raised + " raised" + (goal ? " of $" + goal : "") + " \u2022 " + (playerCount || 0) + " players",
      };
      if (goal && goalCents > 0) {
        state.progressBar = { progress: Math.min(1, totalRaisedCents / goalCents) };
      }
      const config = {
        backgroundColor: "#1a1a2e",
        titleColor: "#FFD700",
        subtitleColor: "#4ade80",
        progressViewTint: "#FFD700",
        padding: 14,
      };
      const activityId = LiveActivity.startActivity(state, config);
      this.currentActivityId = activityId;
      console.log("[LiveActivity] Started fundraiser:", activityId);
      return activityId;
    } catch (e) {
      console.warn("[LiveActivity] Failed to start fundraiser:", e);
      return null;
    }
  }

  // Update fundraiser Live Activity
  async updateFundraiserActivity({ totalRaisedCents, goalCents, playerRank, playerCount }) {
    if (!this.supported || !this.currentActivityId) return;
    try {
      const raised = (totalRaisedCents / 100).toFixed(2);
      const update = {
        subtitle: "$" + raised + " raised \u2022 " + (playerCount || 0) + " players",
      };
      if (goalCents > 0) {
        update.progressBar = { progress: Math.min(1, totalRaisedCents / goalCents) };
      }
      LiveActivity.updateActivity(this.currentActivityId, update);
    } catch {}
  }
}

export const liveActivity = new LiveActivityManager();

export function useLiveActivity() {
  return liveActivity;
}
