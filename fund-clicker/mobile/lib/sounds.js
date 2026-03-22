// Sound effects engine for Fund Clicker
// Crash-safe: if audio fails to load or play, the app continues silently.
// expo-audio may not be available in all contexts (Expo Go, simulator).

let audioModule = null;

try {
  audioModule = require("expo-audio");
} catch {
  // expo-audio not available — sounds disabled
}

const players = {};
let muted = false;
let initialized = false;

async function ensurePlayer(name, source) {
  if (!audioModule || !source) return null;
  if (players[name]) return players[name];
  try {
    // expo-audio's createAudioPlayer is the imperative API
    if (audioModule.createAudioPlayer) {
      players[name] = audioModule.createAudioPlayer(source);
      return players[name];
    }
    // Fallback: try Audio.Sound from expo-av pattern (some versions)
    if (audioModule.Audio?.Sound?.createAsync) {
      const { sound } = await audioModule.Audio.Sound.createAsync(source, { shouldPlay: false, volume: 0.5 });
      players[name] = sound;
      return sound;
    }
  } catch (e) {
    console.warn("Sound load failed:", name, e?.message);
  }
  return null;
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

const SOURCES = {};

export async function initSounds() {
  if (initialized) return;
  initialized = true;
  try {
    SOURCES[SOUNDS.COIN_CLICK] = require("../assets/sounds/coin.mp3");
    SOURCES[SOUNDS.UPGRADE] = require("../assets/sounds/upgrade.wav");
    SOURCES[SOUNDS.ACHIEVEMENT] = require("../assets/sounds/achievement.wav");
    SOURCES[SOUNDS.PHOTO_EVENT] = require("../assets/sounds/photo_event.wav");
    SOURCES[SOUNDS.BATTLE_WIN] = require("../assets/sounds/achievement.wav");
    SOURCES[SOUNDS.BATTLE_LOSE] = require("../assets/sounds/photo_event.wav");
    SOURCES[SOUNDS.SABOTAGE] = require("../assets/sounds/photo_event.wav");
  } catch {
    // Sound files missing — sounds disabled
  }
}

async function play(name, volume = 0.5) {
  if (muted || !SOURCES[name]) return;
  try {
    const p = await ensurePlayer(name, SOURCES[name]);
    if (!p) return;
    // Try expo-audio API
    if (p.seekTo) { p.volume = volume; p.seekTo(0); p.play(); return; }
    // Try expo-av API
    if (p.setPositionAsync) { await p.setVolumeAsync(volume); await p.setPositionAsync(0); await p.playAsync(); return; }
  } catch {
    // Non-critical — game works without sound
  }
}

export function setMuted(m) { muted = m; }

export function playCoinClick() { play(SOUNDS.COIN_CLICK, 0.3); }
export function playUpgrade() { play(SOUNDS.UPGRADE, 0.6); }
export function playAchievement() { play(SOUNDS.ACHIEVEMENT, 0.7); }
export function playBattleStart() { play(SOUNDS.BATTLE_START, 0.7); }
export function playBattleWin() { play(SOUNDS.BATTLE_WIN, 0.8); }
export function playBattleLose() { play(SOUNDS.BATTLE_LOSE, 0.5); }
export function playSabotage() { play(SOUNDS.SABOTAGE, 0.8); }
export function playPhotoEvent() { play(SOUNDS.PHOTO_EVENT, 0.6); }
export function playChatSend() { play(SOUNDS.CHAT_SEND, 0.2); }
