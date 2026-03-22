// Shared game state — single source of truth across all screens
// Handles: load from AsyncStorage, auto-save every 10s, auto-income ticks,
// sabotage processing, and server sync
//
// Uses a module-level global so state persists across tab switches without
// causing unnecessary re-renders via Context (which would re-render ALL tabs
// on every click — 10+ times per second).

import { useState, useEffect, useCallback, useRef } from "react";
import { useOrg } from "../context/OrgContext";
import { useGame } from "../context/GameContext";
import {
  loadGameState,
  saveGameState,
  createInitialState,
  autoIncomeTick,
  processSabotageUpdate,
} from "../lib/gameEngine";

// Module-level singleton
let _globalState = null;
let _loaded = false;
let _listeners = new Set();
let _autoIncomeInterval = null;
let _autoSaveInterval = null;
let _syncInterval = null;
let _currentSlug = null;

function notify() {
  const state = _globalState;
  for (const fn of _listeners) {
    try { fn(state); } catch {}
  }
}

// Set state globally and notify all listeners
function setGlobal(stateOrUpdater) {
  const newState = typeof stateOrUpdater === "function"
    ? stateOrUpdater(_globalState || createInitialState())
    : stateOrUpdater;
  _globalState = newState;
  notify();
}

// Start auto-income ticker (runs once globally, not per-component)
function startAutoIncome() {
  if (_autoIncomeInterval) return;
  _autoIncomeInterval = setInterval(() => {
    if (_globalState && _globalState.coinsPerSecond > 0) {
      _globalState = autoIncomeTick(_globalState);
      notify();
    }
  }, 1000);
}

// Start auto-save (every 10s)
function startAutoSave(slug) {
  if (_autoSaveInterval) clearInterval(_autoSaveInterval);
  _autoSaveInterval = setInterval(() => {
    if (_globalState && slug) {
      saveGameState(slug, _globalState).catch(() => {});
    }
  }, 10000);
}

// Stop all intervals
function stopAll() {
  if (_autoIncomeInterval) { clearInterval(_autoIncomeInterval); _autoIncomeInterval = null; }
  if (_autoSaveInterval) { clearInterval(_autoSaveInterval); _autoSaveInterval = null; }
  if (_syncInterval) { clearInterval(_syncInterval); _syncInterval = null; }
}

export function useGameState() {
  const { org } = useOrg();
  const slug = org?.slug;
  const [localState, setLocalState] = useState(_globalState || createInitialState());
  const mounted = useRef(true);

  // Subscribe to global state changes
  useEffect(() => {
    mounted.current = true;
    const listener = (state) => {
      if (mounted.current && state) setLocalState(state);
    };
    _listeners.add(listener);

    // Load from storage if org changed or not loaded
    if (slug && slug !== _currentSlug) {
      _currentSlug = slug;
      _loaded = false;
      loadGameState(slug).then((state) => {
        _globalState = state;
        _loaded = true;
        notify();
        startAutoIncome();
        startAutoSave(slug);
      });
    } else if (_globalState) {
      setLocalState(_globalState);
      if (!_autoIncomeInterval) {
        startAutoIncome();
        startAutoSave(slug);
      }
    }

    return () => {
      mounted.current = false;
      _listeners.delete(listener);
    };
  }, [slug]);

  const setGameState = useCallback((stateOrUpdater) => {
    setGlobal(stateOrUpdater);
  }, []);

  return {
    gameState: localState,
    setGameState,
    loaded: _loaded,
  };
}

// Process sabotage updates from server (called from ClickerScreen)
export function processServerSabotages(sabotages, playerName) {
  if (_globalState && playerName) {
    const updated = processSabotageUpdate(_globalState, sabotages, playerName);
    if (updated !== _globalState) {
      _globalState = updated;
      notify();
    }
  }
}

// Reset when switching orgs
export function resetGlobalGameState() {
  stopAll();
  _globalState = null;
  _loaded = false;
  _currentSlug = null;
  notify();
}

// Force save now (call before app goes to background)
export async function forceSave() {
  if (_globalState && _currentSlug) {
    await saveGameState(_currentSlug, _globalState);
  }
}
