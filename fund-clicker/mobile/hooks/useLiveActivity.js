// Live Activities (iOS 16.1+) — shows real-time game state on Lock Screen + Dynamic Island
// Uses expo-live-activity (community module) or falls back gracefully
//
// Live Activities show:
// 1. During active battles: player scores, game type, time remaining
// 2. During fundraiser events: total raised, player count, your rank
//
// Note: Live Activities require a native Swift Widget Extension.
// For Expo managed workflow, this requires a custom dev client build
// or the expo-live-activity community package.
//
// This module provides the interface — the native widget is in the
// ios/ directory after ejecting or using a config plugin.

import { Platform, NativeModules, NativeEventEmitter } from "react-native";

// Try to load the native module (will be null in Expo Go / simulator)
const LiveActivityModule = Platform.OS === "ios" ? NativeModules.LiveActivityModule : null;

class LiveActivityManager {
  constructor() {
    this.currentActivityId = null;
    this.supported = Platform.OS === "ios" && !!LiveActivityModule;
  }

  // Check if Live Activities are supported and enabled
  async areActivitiesEnabled() {
    if (!this.supported) return false;
    try {
      return await LiveActivityModule.areActivitiesEnabled();
    } catch {
      return false;
    }
  }

  // Start a Live Activity for an active battle
  async startBattleActivity({ gameType, player1, player2, wagerCoins, duration }) {
    if (!this.supported) return null;
    try {
      const gameNames = {
        rps: "Rock Paper Scissors",
        clickerduel: "Clicker Duel",
        trivia: "Trivia",
        coinflip: "Coin Flip",
        ttt: "Tic-Tac-Toe",
        reaction: "Reaction Race",
      };
      const activityId = await LiveActivityModule.startActivity({
        type: "battle",
        title: gameNames[gameType] || gameType,
        player1Name: player1,
        player2Name: player2,
        player1Score: 0,
        player2Score: 0,
        wagerCoins,
        duration: duration || 0,
        status: "active",
      });
      this.currentActivityId = activityId;
      return activityId;
    } catch (e) {
      console.warn("Failed to start Live Activity:", e);
      return null;
    }
  }

  // Update the Live Activity with new scores
  async updateBattleActivity({ player1Score, player2Score, status, winner }) {
    if (!this.supported || !this.currentActivityId) return;
    try {
      await LiveActivityModule.updateActivity(this.currentActivityId, {
        player1Score,
        player2Score,
        status: status || "active",
        winner: winner || "",
      });
    } catch (e) {
      console.warn("Failed to update Live Activity:", e);
    }
  }

  // End the Live Activity
  async endBattleActivity({ winner, finalMessage }) {
    if (!this.supported || !this.currentActivityId) return;
    try {
      await LiveActivityModule.endActivity(this.currentActivityId, {
        winner: winner || "",
        finalMessage: finalMessage || "Game over!",
      });
      this.currentActivityId = null;
    } catch (e) {
      console.warn("Failed to end Live Activity:", e);
    }
  }

  // Start a fundraiser progress Live Activity (shows total raised, rank)
  async startFundraiserActivity({ orgName, totalRaised, playerRank, playerCount }) {
    if (!this.supported) return null;
    try {
      const activityId = await LiveActivityModule.startActivity({
        type: "fundraiser",
        title: orgName,
        totalRaisedCents: totalRaised,
        playerRank: playerRank || 0,
        playerCount: playerCount || 0,
        status: "active",
      });
      this.currentActivityId = activityId;
      return activityId;
    } catch {
      return null;
    }
  }

  // Update fundraiser Live Activity
  async updateFundraiserActivity({ totalRaised, playerRank, playerCount }) {
    if (!this.supported || !this.currentActivityId) return;
    try {
      await LiveActivityModule.updateActivity(this.currentActivityId, {
        totalRaisedCents: totalRaised,
        playerRank,
        playerCount,
      });
    } catch {}
  }
}

export const liveActivity = new LiveActivityManager();

// React hook for components
export function useLiveActivity() {
  return liveActivity;
}
