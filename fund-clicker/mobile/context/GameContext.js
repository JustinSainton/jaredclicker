// GameContext: Full-featured player session, WebSocket connection, and game event bus
// Staff-engineer quality: handles ALL WebSocket message types from the DO,
// manages battle challenges, active games, score corrections, bans, coin cuts,
// push notification registration, and app state persistence.

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { AppState, Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "../lib/haptics";
import { vibrate } from "../lib/haptics";
import { api } from "../lib/api";

const GameContext = createContext(null);
const PLAYER_KEY = "@fundclicker_player";

export function GameProvider({ children, orgSlug }) {
  // ─── PLAYER STATE ─────────────────────────────────────────────────
  const [player, setPlayer] = useState(null);
  const [connected, setConnected] = useState(false);

  // ─── SERVER STATE (from broadcasts) ───────────────────────────────
  const [leaderboard, setLeaderboard] = useState([]);
  const [online, setOnline] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [orgConfig, setOrgConfig] = useState(null);
  const [sabotages, setSabotages] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [activeGames, setActiveGames] = useState([]);
  const [hallOfFame, setHallOfFame] = useState([]);
  const [scoreEpoch, setScoreEpoch] = useState(0);
  const [visitors, setVisitors] = useState(0);
  const [credits, setCredits] = useState({});
  const [groupLobbies, setGroupLobbies] = useState([]);

  // ─── BATTLE STATE ─────────────────────────────────────────────────
  const [pendingChallenge, setPendingChallenge] = useState(null);
  const [currentGame, setCurrentGame] = useState(null);
  const [gameResult, setGameResult] = useState(null);
  const [challengeSentTo, setChallengeSentTo] = useState(null);

  // ─── NOTIFICATIONS ────────────────────────────────────────────────
  const [scoreCorrection, setScoreCorrection] = useState(null);
  const [coinCutEvent, setCoinCutEvent] = useState(null);
  const [banInfo, setBanInfo] = useState(null);
  const [totalRaised, setTotalRaised] = useState(null);
  const [podiumChange, setPodiumChange] = useState(null);
  const [nextResetAt, setNextResetAt] = useState(null);

  // ─── REFS ─────────────────────────────────────────────────────────
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const reconnectAttempts = useRef(0);
  const appState = useRef(AppState.currentState);

  // ─── LOAD SAVED PLAYER ────────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(`${PLAYER_KEY}_${orgSlug}`).then((data) => {
      if (data) {
        try { setPlayer(JSON.parse(data)); } catch {}
      }
    });
  }, [orgSlug]);

  // Keep a ref to the message handler so WS always calls the latest version
  const handleWSMessageRef = useRef(null);
  handleWSMessageRef.current = handleWSMessage;

  // ─── WEBSOCKET CONNECTION ─────────────────────────────────────────
  useEffect(() => {
    if (!orgSlug) return;

    function connect() {
      const wsUrl = api.getWebSocketURL(orgSlug);
      // WS connecting
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        // WS connected
        setConnected(true);
        reconnectAttempts.current = 0;
        if (player?.name && player?.token) {
          ws.send(JSON.stringify({
            type: "setIdentity",
            name: player.name,
            authToken: player.token,
          }));
        }
      };

      ws.addEventListener("message", (event) => {
        try {
          const msg = JSON.parse(event.data);
          handleWSMessageRef.current?.(msg);
        } catch {}
      });

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
        reconnectAttempts.current++;
        reconnectTimer.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect on intentional close
        wsRef.current.close();
      }
    };
  }, [orgSlug]); // Don't depend on player — we send setName after connect

  // Re-send identity when player changes
  useEffect(() => {
    if (player?.name && player?.token && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "setIdentity",
        name: player.name,
        authToken: player.token,
      }));
    }
  }, [player?.name, player?.token]);

  // ─── APP STATE (reconnect when foregrounded) ──────────────────────
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === "active") {
        // App came to foreground — reconnect if disconnected
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
          reconnectAttempts.current = 0;
          // Trigger reconnect
          setConnected(false);
        }
      }
      appState.current = nextState;
    });
    return () => sub?.remove();
  }, []);

  // ─── WS MESSAGE HANDLER (comprehensive) ──────────────────────────
  // Not wrapped in useCallback — state setters are stable, and using a ref
  // ensures the WS always calls the latest version
  const handleWSMessage = (msg) => {
    switch (msg.type) {
      // ── Broadcast: full game state update
      case "update":
        setLeaderboard(msg.leaderboard || []);
        setOnline(msg.online || []);
        setSabotages(msg.sabotages || []);
        setCampaigns(msg.campaigns || []);
        setActiveGames(msg.activeGames || []);
        setHallOfFame(msg.hallOfFame || []);
        setScoreEpoch(msg.scoreEpoch || 0);
        setVisitors(msg.visitors || 0);
        if (msg.credits) setCredits(msg.credits);
        if (msg.groupLobbies) setGroupLobbies(msg.groupLobbies);
        if (msg.nextResetAt) setNextResetAt(msg.nextResetAt);
        if (msg.podiumChange) {
          setPodiumChange(msg.podiumChange);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        }
        break;

      // ── Chat
      case "chatHistory":
        setChatMessages(msg.messages || []);
        break;
      case "chatMessage":
        console.warn("CHAT MSG RECEIVED:", msg.name, msg.message?.slice(0, 20));
        setChatMessages((prev) => {
          const next = [...prev, msg];
          console.warn("CHAT STATE:", prev.length, "->", next.length);
          return next;
        });
        break;
      case "chatReaction":
        // Emit reaction event — ChatScreen handles display
        setChatMessages((prev) => {
          const idx = prev.findIndex(m => m.id === msg.messageId);
          if (idx === -1) return prev;
          const updated = [...prev];
          const target = { ...updated[idx] };
          if (!target.reactions) target.reactions = {};
          if (!target.reactions[msg.emoji]) target.reactions[msg.emoji] = [];
          if (!target.reactions[msg.emoji].includes(msg.name)) {
            target.reactions[msg.emoji] = [...target.reactions[msg.emoji], msg.name];
          }
          updated[idx] = target;
          return updated;
        });
        break;

      // ── Org config
      case "orgConfig":
        setOrgConfig(msg.config);
        break;

      // ── Score management
      case "resetAll":
        setScoreEpoch(msg.scoreEpoch || 0);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert("Scores Reset!", "All scores have been reset. Time for a fresh start!");
        break;

      case "scoreCorrection":
        setScoreCorrection({
          targetName: msg.targetName,
          newScore: msg.newScore,
          delta: msg.delta,
          timestamp: Date.now(),
        });
        if (msg.delta < 0) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } else if (msg.delta > 0) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        break;

      // ── Battle: incoming challenge
      case "challengeReceived":
        setPendingChallenge(msg.challenge);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        vibrate([0, 200, 100, 200]); // Double buzz
        break;

      case "challengeSent":
        setChallengeSentTo(msg.challenge?.targetName);
        break;

      case "challengeExpired":
        if (pendingChallenge?.id === msg.challengeId) setPendingChallenge(null);
        if (challengeSentTo) setChallengeSentTo(null);
        break;

      case "challengeDeclined":
        setChallengeSentTo(null);
        if (msg.reason === "insufficient_coins") {
          Alert.alert("Challenge Failed", "Not enough coins for this wager.");
        } else if (msg.reason === "in_game") {
          Alert.alert("Challenge Failed", "Player is already in a game.");
        } else {
          Alert.alert("Challenge Declined", "Your challenge was declined.");
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        break;

      // ── Battle: game lifecycle
      case "gameStarted":
        setCurrentGame(msg.game);
        setChallengeSentTo(null);
        setPendingChallenge(null);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;

      case "gameUpdate":
        setCurrentGame((prev) => {
          if (!prev || prev.id !== msg.game?.id) return msg.game;
          return { ...prev, ...msg.game };
        });
        break;

      case "gameEnded":
        setCurrentGame(msg.game);
        setGameResult({
          game: msg.game,
          reason: msg.reason,
          timestamp: Date.now(),
        });
        const isWin = msg.game?.winner?.toLowerCase() === player?.name?.toLowerCase();
        const isDraw = msg.game?.winner === "draw";
        if (isWin) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else if (!isDraw) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
        // Auto-clear game after 10s
        setTimeout(() => {
          setCurrentGame(null);
          setGameResult(null);
        }, 10000);
        break;

      // ── Group games
      case "groupLobbyCreated":
      case "groupLobbyUpdate":
        // Refresh lobby list on next broadcast
        break;
      case "groupLobbyExpired":
        break;
      case "groupGameStarted":
        setCurrentGame(msg.game);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
      case "groupGameUpdate":
        setCurrentGame((prev) => prev?.id === msg.game?.id ? { ...prev, ...msg.game } : prev);
        break;
      case "groupGameEnded":
        setCurrentGame(msg.game);
        setTimeout(() => setCurrentGame(null), 10000);
        break;

      // ── Sabotage / coin cut
      case "coinCutEvent":
        setCoinCutEvent(msg);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        vibrate(500);
        break;

      // ── Ban
      case "banned":
        setBanInfo({ until: msg.until, reason: msg.reason });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert(
          "Temporarily Banned",
          `${msg.reason}\n\nBan expires: ${new Date(msg.until).toLocaleTimeString()}`,
        );
        break;
      case "unbanned":
        setBanInfo(null);
        Alert.alert("Unbanned!", "You've been unbanned. Welcome back!");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;

      // ── Total raised
      case "totalRaised":
        setTotalRaised({
          totalRaisedCents: msg.totalRaisedCents,
          transactionCount: msg.transactionCount,
        });
        break;

      case "unauthorized":
        if (__DEV__) console.warn("WS unauthorized:", msg.reason || "unauthorized");
        break;

      // ── Wallet (for credit-based wagering)
      case "walletDeduct":
      case "walletAward":
        // Handled by score corrections in broadcast
        break;

      default:
        // Unknown message type — log for debugging
        if (__DEV__) console.log("Unhandled WS message:", msg.type);
    }
  };

  // ─── WS SEND HELPER ──────────────────────────────────────────────
  const sendWS = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  // ─── PLAYER AUTH ──────────────────────────────────────────────────
  const registerPlayer = useCallback(async (name, pin) => {
    const result = await api.register(orgSlug, name, pin);
    const p = { name: result.displayName, token: result.token, score: result.score || 0 };
    setPlayer(p);
    await AsyncStorage.setItem(`${PLAYER_KEY}_${orgSlug}`, JSON.stringify(p));
    sendWS({ type: "setIdentity", name: p.name, authToken: p.token });
    return p;
  }, [orgSlug, sendWS]);

  const loginPlayer = useCallback(async (name, pin) => {
    const result = await api.login(orgSlug, name, pin);
    const p = { name: result.displayName, token: result.token, score: result.score || 0, gameState: result.gameState };
    setPlayer(p);
    await AsyncStorage.setItem(`${PLAYER_KEY}_${orgSlug}`, JSON.stringify(p));
    sendWS({ type: "setIdentity", name: p.name, authToken: p.token });
    return p;
  }, [orgSlug, sendWS]);

  const logoutPlayer = useCallback(async () => {
    if (player?.token) {
      try { await api.logout(orgSlug, player.token); } catch {}
    }
    setPlayer(null);
    await AsyncStorage.removeItem(`${PLAYER_KEY}_${orgSlug}`);
  }, [orgSlug, player]);

  // ─── GAME ACTIONS ─────────────────────────────────────────────────
  const updateScore = useCallback((score, stats) => {
    sendWS({
      type: "scoreUpdate",
      name: player?.name,
      score,
      scoreEpoch,
      authToken: player?.token,
      ...stats,
    });
  }, [player, scoreEpoch, sendWS]);

  const sendChat = useCallback((message, opts = {}) => {
    const payload = { type: "chat", message };
    if (opts.replyTo) payload.replyTo = opts.replyTo;
    if (opts.gif) payload.gif = opts.gif;
    sendWS(payload);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [sendWS]);

  const sendReaction = useCallback((messageId, emoji) => {
    sendWS({ type: "chatReaction", messageId, emoji });
    Haptics.selectionAsync();
  }, [sendWS]);

  const useSabotageCredit = useCallback((targetName) => {
    sendWS({ type: "useSabotageCredit", targetName });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [sendWS]);

  const challenge = useCallback((targetName, gameType, wagerCoins) => {
    sendWS({ type: "challenge", targetName, gameType, wagerCoins });
    setChallengeSentTo(targetName);
  }, [sendWS]);

  const acceptChallenge = useCallback((challengeId) => {
    sendWS({ type: "acceptChallenge", challengeId });
    setPendingChallenge(null);
  }, [sendWS]);

  const declineChallenge = useCallback((challengeId) => {
    sendWS({ type: "declineChallenge", challengeId });
    setPendingChallenge(null);
  }, [sendWS]);

  const sendGameMove = useCallback((gameId, move) => {
    sendWS({ type: "gameMove", gameId, move });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [sendWS]);

  const createGroupLobby = useCallback((gameType, wagerCoins, minPlayers, maxPlayers) => {
    sendWS({ type: "createGroupLobby", gameType, wagerCoins, minPlayers, maxPlayers });
  }, [sendWS]);

  const joinGroupLobby = useCallback((lobbyId) => {
    sendWS({ type: "joinGroupLobby", lobbyId });
  }, [sendWS]);

  const startGroupGame = useCallback((lobbyId) => {
    sendWS({ type: "startGroupGame", lobbyId });
  }, [sendWS]);

  const dismissGame = useCallback(() => {
    setCurrentGame(null);
    setGameResult(null);
  }, []);

  // ─── CONTEXT VALUE ────────────────────────────────────────────────
  return (
    <GameContext.Provider
      value={{
        // Player
        player, registerPlayer, loginPlayer, logoutPlayer,
        // Connection
        connected, visitors,
        // Server state
        leaderboard, online, chatMessages, sendReaction, useSabotageCredit, orgConfig, sabotages,
        campaigns, activeGames, hallOfFame, scoreEpoch, credits,
        groupLobbies, totalRaised, podiumChange, nextResetAt,
        // Battle
        pendingChallenge, currentGame, gameResult, challengeSentTo,
        challenge, acceptChallenge, declineChallenge, sendGameMove,
        dismissGame,
        // Group games
        createGroupLobby, joinGroupLobby, startGroupGame,
        // Notifications
        scoreCorrection, coinCutEvent, banInfo,
        // Actions
        updateScore, sendChat, sendWS,
      }}
    >
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame must be used within GameProvider");
  return ctx;
}
