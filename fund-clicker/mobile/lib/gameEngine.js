// Fund Clicker: Complete Game Engine
// Mirrors the full jaredclicker.com experience — all upgrades, achievements,
// smelly levels, photo events, save/load, and anti-autoclicker.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

// ─── UPGRADES (40 across 8 tiers) ────────────────────────────────────────────
// In multi-tenant mode, names/emojis can be overridden via org config.
// The effect values (coins per click/sec) are universal.

export const DEFAULT_UPGRADES = [
  // Tier 1: Early game (15-100)
  { id: "deodorant", name: "Deodorant", emoji: "\uD83E\uDDF4", desc: "+1 coin per click", baseCost: 15, scaling: 1.15, clickBonus: 1, autoBonus: 0 },
  { id: "intern", name: "Clicking Intern", emoji: "\uD83D\uDC68\u200D\uD83D\uDCBC", desc: "+1 coin per second", baseCost: 50, scaling: 1.15, clickBonus: 0, autoBonus: 1 },
  { id: "noseplug", name: "Nose Plugs", emoji: "\uD83D\uDC43", desc: "+2 coins per click", baseCost: 100, scaling: 1.15, clickBonus: 2, autoBonus: 0 },

  // Tier 2: Getting going (200-500)
  { id: "febreze", name: "Industrial Febreze", emoji: "\uD83D\uDCA8", desc: "+3 coins per second", baseCost: 200, scaling: 1.15, clickBonus: 0, autoBonus: 3 },
  { id: "sweatshirt", name: "Lucky Sweatshirt", emoji: "\uD83D\uDC55", desc: "+5 coins per second", baseCost: 300, scaling: 1.15, clickBonus: 0, autoBonus: 5 },
  { id: "mirror", name: "Selfie Mirror", emoji: "\uD83E\uDE9E", desc: "+5 coins per click", baseCost: 500, scaling: 1.2, clickBonus: 5, autoBonus: 0 },

  // Tier 3: Mid game (750-3000)
  { id: "laundry", name: "Laundry Pile", emoji: "\uD83E\uDDFA", desc: "+10 coins per second", baseCost: 750, scaling: 1.15, clickBonus: 0, autoBonus: 10 },
  { id: "hairgel", name: "Hair Growth Formula", emoji: "\uD83D\uDC87", desc: "+20 coins per second", baseCost: 1500, scaling: 1.15, clickBonus: 0, autoBonus: 20 },
  { id: "gym", name: "Gym Membership", emoji: "\uD83D\uDCAA", desc: "+15 coins per click", baseCost: 3000, scaling: 1.2, clickBonus: 15, autoBonus: 0 },

  // Tier 4: Ramp up (5000-25000)
  { id: "podcast", name: "Podcast", emoji: "\uD83C\uDFA4", desc: "+50 coins per second", baseCost: 5000, scaling: 1.15, clickBonus: 0, autoBonus: 50 },
  { id: "cologne", name: "Signature Cologne", emoji: "\u2728", desc: "+100 coins per second", baseCost: 10000, scaling: 1.15, clickBonus: 0, autoBonus: 100 },
  { id: "clone", name: "Clone Army", emoji: "\uD83E\uDDEC", desc: "+50 coins per click", baseCost: 25000, scaling: 1.2, clickBonus: 50, autoBonus: 0 },

  // Tier 5: Big money (50K-500K)
  { id: "factory", name: "Coin Factory", emoji: "\uD83C\uDFED", desc: "+250 coins per second", baseCost: 50000, scaling: 1.15, clickBonus: 0, autoBonus: 250 },
  { id: "timemachine", name: "Time Machine", emoji: "\u23F0", desc: "+500 coins per second", baseCost: 100000, scaling: 1.15, clickBonus: 0, autoBonus: 500 },
  { id: "goldennose", name: "Golden Nose", emoji: "\uD83D\uDC51", desc: "+100 coins per click", baseCost: 250000, scaling: 1.2, clickBonus: 100, autoBonus: 0 },
  { id: "blackhole", name: "Coin Singularity", emoji: "\uD83D\uDD73\uFE0F", desc: "+200 coins per click", baseCost: 500000, scaling: 1.2, clickBonus: 200, autoBonus: 0 },

  // Tier 6: Millions (1M-5M)
  { id: "satellite", name: "Orbital Satellite", emoji: "\uD83D\uDEF0\uFE0F", desc: "+2,000 coins per second", baseCost: 1000000, scaling: 1.15, clickBonus: 0, autoBonus: 2000 },
  { id: "universe", name: "Multiverse Portal", emoji: "\uD83C\uDF0C", desc: "+5,000 coins per second", baseCost: 5000000, scaling: 1.15, clickBonus: 0, autoBonus: 5000 },

  // Tier 7: Tens of millions (10M-100M)
  { id: "stinkworm", name: "Worm Virus", emoji: "\uD83D\uDC1B", desc: "+500 coins per click", baseCost: 10000000, scaling: 1.2, clickBonus: 500, autoBonus: 0 },
  { id: "quantumfunk", name: "Quantum Reactor", emoji: "\u269B\uFE0F", desc: "+1,000 coins per click", baseCost: 25000000, scaling: 1.2, clickBonus: 1000, autoBonus: 0 },
  { id: "dyson", name: "Dyson Sphere", emoji: "\u2600\uFE0F", desc: "+25,000 coins per second", baseCost: 50000000, scaling: 1.15, clickBonus: 0, autoBonus: 25000 },
  { id: "stinknet", name: "AI Network", emoji: "\uD83E\uDD16", desc: "+50,000 coins per second", baseCost: 100000000, scaling: 1.15, clickBonus: 0, autoBonus: 50000 },

  // Tier 8: Endgame (500M-1T)
  { id: "dimension", name: "Dimension Rift", emoji: "\uD83C\uDF00", desc: "+5K/click, +100K/sec", baseCost: 500000000, scaling: 1.2, clickBonus: 5000, autoBonus: 100000 },
  { id: "bigbang", name: "The Big Bang", emoji: "\uD83D\uDCA5", desc: "+10K/click, +500K/sec", baseCost: 1000000000, scaling: 1.2, clickBonus: 10000, autoBonus: 500000 },
  { id: "godofstink", name: "Supreme Overlord", emoji: "\uD83D\uDC80", desc: "+50K/click, +2M/sec", baseCost: 10000000000, scaling: 1.25, clickBonus: 50000, autoBonus: 2000000 },
  { id: "stinkmatrix", name: "The Matrix", emoji: "\uD83D\uDFE2", desc: "+200,000 per click", baseCost: 50000000000, scaling: 1.25, clickBonus: 200000, autoBonus: 0 },
  { id: "funkforge", name: "Eternal Forge", emoji: "\uD83D\uDD25", desc: "+10M per second", baseCost: 200000000000, scaling: 1.2, clickBonus: 0, autoBonus: 10000000 },
  { id: "omegastink", name: "OMEGA", emoji: "\uD83D\uDCA2", desc: "+1M/click, +50M/sec", baseCost: 1000000000000, scaling: 1.3, clickBonus: 1000000, autoBonus: 50000000 },
];

// ─── ACHIEVEMENTS ─────────────────────────────────────────────────────────────

export const ACHIEVEMENTS = [
  { id: "first_click", name: "First Click", check: (s) => s.totalClicks >= 1 },
  { id: "clicks_100", name: "Dedicated (100 clicks)", check: (s) => s.totalClicks >= 100 },
  { id: "clicks_1000", name: "Click Addict (1K clicks)", check: (s) => s.totalClicks >= 1000 },
  { id: "clicks_10000", name: "Click Machine (10K)", check: (s) => s.totalClicks >= 10000 },
  { id: "coins_100", name: "Pocket Change (100)", check: (s) => s.totalCoins >= 100 },
  { id: "coins_1000", name: "Getting Rich (1K)", check: (s) => s.totalCoins >= 1000 },
  { id: "coins_10000", name: "Tycoon (10K)", check: (s) => s.totalCoins >= 10000 },
  { id: "coins_100000", name: "Baron (100K)", check: (s) => s.totalCoins >= 100000 },
  { id: "coins_1000000", name: "Overlord (1M)", check: (s) => s.totalCoins >= 1000000 },
  { id: "first_sighting", name: "Character Spotted!", check: (s) => s.sightings >= 1 },
  { id: "sightings_10", name: "Stalker (10 sightings)", check: (s) => s.sightings >= 10 },
  { id: "first_upgrade", name: "First Purchase", check: (s) => Object.keys(s.upgrades).length > 0 },
  { id: "five_upgrades", name: "Shopping Spree", check: (s) => Object.values(s.upgrades).reduce((a, b) => a + b, 0) >= 5 },
  { id: "first_battle", name: "First Battle", check: (s) => s.battlesPlayed >= 1 },
  { id: "first_win", name: "Victory!", check: (s) => s.battlesWon >= 1 },
];

// ─── RANK LEVELS ──────────────────────────────────────────────────────────────

export const RANK_LEVELS = [
  { threshold: 0, name: "Newbie" },
  { threshold: 100, name: "Getting Started" },
  { threshold: 500, name: "Casual Clicker" },
  { threshold: 2000, name: "Dedicated" },
  { threshold: 10000, name: "Serious Player" },
  { threshold: 50000, name: "Power Clicker" },
  { threshold: 200000, name: "Click Master" },
  { threshold: 1000000, name: "Millionaire" },
  { threshold: 5000000, name: "Multi-Millionaire" },
  { threshold: 10000000, name: "Mega Rich" },
  { threshold: 50000000, name: "Tycoon" },
  { threshold: 100000000, name: "Billionaire" },
  { threshold: 500000000, name: "Click Emperor" },
  { threshold: 1000000000, name: "Legendary" },
  { threshold: 5000000000, name: "Mythical" },
  { threshold: 10000000000, name: "Transcendent" },
  { threshold: 50000000000, name: "Cosmic" },
  { threshold: 100000000000, name: "ULTIMATE" },
  { threshold: 500000000000, name: "Infinite" },
  { threshold: 1000000000000, name: "The Unstoppable" },
  { threshold: 5000000000000, name: "Legend of Legends" },
  { threshold: 10000000000000, name: "Beyond All" },
  { threshold: 50000000000000, name: "Rewriting History" },
  { threshold: 100000000000000, name: "BEYOND KNOWN LIMITS" },
  { threshold: 1000000000000000, name: "The Multiverse" },
  { threshold: 10000000000000000, name: "THE ONE WHO ENDED IT ALL" },
  { threshold: 50000000000000000, name: "ASCENDED" },
];

// ─── GAME STATE ───────────────────────────────────────────────────────────────

export function createInitialState() {
  return {
    coins: 0,
    totalCoins: 0,
    totalClicks: 0,
    coinsPerClick: 1,
    coinsPerSecond: 0,
    sightings: 0,
    clicksSinceLastEvent: 0,
    nextEventAt: randomBetween(12, 25),
    upgrades: {},       // { upgradeId: ownedCount }
    achievements: [],   // array of achieved IDs
    battlesPlayed: 0,
    battlesWon: 0,
    scoreEpoch: 0,
    sabotageMultiplier: 1, // 1 = normal, 0.5 = sabotaged
    sabotageEndAt: 0,
    lastSaveAt: 0,
    wallet: 0,          // separate wallet balance for wagering
  };
}

// ─── WALLET OPERATIONS ────────────────────────────────────────────────────────

export function depositToWallet(state, amount) {
  if (amount <= 0 || amount > state.coins) return null;
  return { ...state, coins: state.coins - amount, wallet: state.wallet + amount };
}

export function withdrawFromWallet(state, amount) {
  if (amount <= 0 || amount > state.wallet) return null;
  return { ...state, coins: state.coins + amount, wallet: state.wallet - amount };
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

export function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function formatNumber(n) {
  if (n >= 1e15) return (n / 1e15).toFixed(1) + "Q";
  if (n >= 1e12) return (n / 1e12).toFixed(1) + "T";
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return Math.floor(n).toLocaleString();
}

export function getUpgradeCost(upgrade, ownedCount) {
  return Math.floor(upgrade.baseCost * Math.pow(upgrade.scaling, ownedCount || 0));
}

export function getRank(totalCoins) {
  let rank = RANK_LEVELS[0];
  for (const level of RANK_LEVELS) {
    if (totalCoins >= level.threshold) rank = level;
  }
  return rank;
}

export function getRankProgress(totalCoins) {
  const rank = getRank(totalCoins);
  const idx = RANK_LEVELS.indexOf(rank);
  if (idx >= RANK_LEVELS.length - 1) return 100;
  const next = RANK_LEVELS[idx + 1];
  return Math.min(100, Math.max(0, ((totalCoins - rank.threshold) / (next.threshold - rank.threshold)) * 100));
}

// ─── UPGRADE PURCHASE ─────────────────────────────────────────────────────────

export function purchaseUpgrade(state, upgradeId) {
  const upgrade = DEFAULT_UPGRADES.find((u) => u.id === upgradeId);
  if (!upgrade) return null;
  const owned = state.upgrades[upgradeId] || 0;
  const cost = getUpgradeCost(upgrade, owned);
  if (state.coins < cost) return null;

  const newState = { ...state };
  newState.coins -= cost;
  newState.upgrades = { ...state.upgrades, [upgradeId]: owned + 1 };
  newState.coinsPerClick += upgrade.clickBonus;
  newState.coinsPerSecond += upgrade.autoBonus;
  return newState;
}

// ─── CLICK HANDLER ────────────────────────────────────────────────────────────

export function handleClick(state) {
  const mult = state.sabotageEndAt > Date.now() ? state.sabotageMultiplier : 1;
  let earned = Math.floor(state.coinsPerClick * mult);
  if (mult > 0 && earned < 1) earned = 1;
  if (mult === 0) earned = 0;

  const newState = { ...state };
  newState.coins += earned;
  newState.totalCoins += earned;
  newState.totalClicks += 1;
  newState.clicksSinceLastEvent += 1;

  // Check for photo event
  let photoEvent = null;
  if (newState.clicksSinceLastEvent >= newState.nextEventAt) {
    const bonus = Math.floor((newState.coinsPerClick * 10 + newState.coinsPerSecond * 5) * mult) + 50;
    newState.coins += bonus;
    newState.totalCoins += bonus;
    newState.sightings += 1;
    newState.clicksSinceLastEvent = 0;
    newState.nextEventAt = randomBetween(12, 25);
    photoEvent = { bonus };
  }

  return { state: newState, earned, photoEvent };
}

// ─── AUTO INCOME TICK ─────────────────────────────────────────────────────────

export function autoIncomeTick(state) {
  if (state.coinsPerSecond <= 0) return state;
  const mult = state.sabotageEndAt > Date.now() ? state.sabotageMultiplier : 1;
  const earned = Math.floor(state.coinsPerSecond * mult);
  return {
    ...state,
    coins: state.coins + earned,
    totalCoins: state.totalCoins + earned,
  };
}

// ─── ACHIEVEMENT CHECK ────────────────────────────────────────────────────────

export function checkAchievements(state) {
  const newAchievements = [];
  for (const ach of ACHIEVEMENTS) {
    if (!state.achievements.includes(ach.id) && ach.check(state)) {
      newAchievements.push(ach);
    }
  }
  if (newAchievements.length === 0) return { state, newAchievements: [] };

  return {
    state: {
      ...state,
      achievements: [...state.achievements, ...newAchievements.map((a) => a.id)],
    },
    newAchievements,
  };
}

// ─── SAVE / LOAD ──────────────────────────────────────────────────────────────

const SAVE_KEY = "@fc_gamestate";

export async function saveGameState(orgSlug, state) {
  const key = `${SAVE_KEY}_${orgSlug}`;
  const data = { ...state, lastSaveAt: Date.now() };
  await AsyncStorage.setItem(key, JSON.stringify(data));
  return data;
}

export async function loadGameState(orgSlug) {
  const key = `${SAVE_KEY}_${orgSlug}`;
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return createInitialState();
  try {
    const data = JSON.parse(raw);
    // Calculate offline earnings
    if (data.lastSaveAt && data.coinsPerSecond > 0) {
      const offlineSeconds = Math.min(3600, (Date.now() - data.lastSaveAt) / 1000); // cap at 1 hour
      const offlineEarnings = Math.floor(data.coinsPerSecond * offlineSeconds * 0.5); // 50% efficiency offline
      data.coins += offlineEarnings;
      data.totalCoins += offlineEarnings;
      data._offlineEarnings = offlineEarnings;
      data._offlineSeconds = Math.floor(offlineSeconds);
    }
    return { ...createInitialState(), ...data };
  } catch {
    return createInitialState();
  }
}

// ─── ANTI-AUTOCLICKER (WEB ONLY) ─────────────────────────────────────────────
// On native (iOS/Android), no client-side rate limiting — server handles detection
// via checkAutoClickerAndBan() with a 50 CPS threshold.
// On web, rate limit to 12 CPS to prevent mouse macros.

const clickTimes = [];
const MAX_CPS = 12;

export function isClickAllowed() {
  // No client-side rate limiting on native — fast thumb tapping is legitimate
  if (Platform.OS !== "web") return true;

  // Web only: rate limit to prevent mouse macros
  const now = Date.now();
  clickTimes.push(now);
  while (clickTimes.length > 0 && clickTimes[0] < now - 1000) {
    clickTimes.shift();
  }
  return clickTimes.length <= MAX_CPS;
}

// ─── SABOTAGE PROCESSING ─────────────────────────────────────────────────────

export function processSabotageUpdate(state, sabotages, playerName) {
  const lower = playerName.toLowerCase();
  const active = sabotages.find(
    (s) => s.targetName.toLowerCase() === lower && s.expiresAt > Date.now()
  );
  if (active) {
    return {
      ...state,
      sabotageMultiplier: active.freeze ? 0 : 0.5,
      sabotageEndAt: active.expiresAt,
    };
  }
  if (state.sabotageMultiplier !== 1) {
    return { ...state, sabotageMultiplier: 1, sabotageEndAt: 0 };
  }
  return state;
}
