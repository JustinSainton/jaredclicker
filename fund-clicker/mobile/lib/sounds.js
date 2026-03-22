// Sound effects engine for Fund Clicker
// Uses expo-audio (replacement for deprecated expo-av)
// Sounds are bundled with the app for instant playback
import { AudioPlayer } from "expo-audio";
import { Platform } from "react-native";

// Simple sound cache — expo-audio players are lightweight enough
// that we don't need complex pooling like expo-av required
const players = {};
let muted = false;

function getPlayer(name, source) {
  if (!players[name]) {
    try {
      players[name] = new AudioPlayer(source);
    } catch (e) {
      console.warn("Failed to create audio player:", name, e);
      return null;
    }
  }
  return players[name];
}

// Sound identifiers
export const SOUNDS = {
  COIN_CLICK: "coin_click",
  UPGRADE: "upgrade",
  ACHIEVEMENT: "achievement",
  BATTLE_START: "battle_start",
  BATTLE_WIN: "battle_win",
  BATTLE_LOSE: "battle_lose",
  SABOTAGE: "sabotage",
  PHOTO_EVENT: "photo_event",
  CHAT_SEND: "chat_send",
  COIN_CUT: "coin_cut",
};

// Source map
const SOURCES = {};

export async function initSounds() {
  try {
    SOURCES[SOUNDS.COIN_CLICK] = require("../assets/sounds/coin.mp3");
    SOURCES[SOUNDS.UPGRADE] = require("../assets/sounds/upgrade.wav");
    SOURCES[SOUNDS.ACHIEVEMENT] = require("../assets/sounds/achievement.wav");
    SOURCES[SOUNDS.PHOTO_EVENT] = require("../assets/sounds/photo_event.wav");
    SOURCES[SOUNDS.BATTLE_WIN] = require("../assets/sounds/achievement.wav");
    SOURCES[SOUNDS.BATTLE_LOSE] = require("../assets/sounds/photo_event.wav");
    SOURCES[SOUNDS.SABOTAGE] = require("../assets/sounds/photo_event.wav");
  } catch (e) {
    console.warn("Sound init error:", e);
  }
}

function play(name, volume = 0.5) {
  if (muted || !SOURCES[name]) return;
  try {
    const p = getPlayer(name, SOURCES[name]);
    if (!p) return;
    p.volume = volume;
    p.seekTo(0);
    p.play();
  } catch {
    // Non-critical
  }
}

export function setMuted(m) { muted = m; }

// Convenience functions
export function playCoinClick() { play(SOUNDS.COIN_CLICK, 0.3); }
export function playUpgrade() { play(SOUNDS.UPGRADE, 0.6); }
export function playAchievement() { play(SOUNDS.ACHIEVEMENT, 0.7); }
export function playBattleStart() { play(SOUNDS.BATTLE_START, 0.7); }
export function playBattleWin() { play(SOUNDS.BATTLE_WIN, 0.8); }
export function playBattleLose() { play(SOUNDS.BATTLE_LOSE, 0.5); }
export function playSabotage() { play(SOUNDS.SABOTAGE, 0.8); }
export function playPhotoEvent() { play(SOUNDS.PHOTO_EVENT, 0.6); }
export function playChatSend() { play(SOUNDS.CHAT_SEND, 0.2); }
