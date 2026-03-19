// Durable Object for tracking live visitors via WebSocket
export class LiveVisitors {
  constructor(state) {
    this.state = state;
    this.connections = new Map();
    this.persistedScores = null; // lazy-loaded from storage
    this.sabotages = []; // active sabotages: { targetName, attackerName, expiresAt }
    this.sabotagesLoaded = false;
    this.credits = null; // lazy-loaded: { [lowercase_name]: count }
    this.chatMessages = null; // lazy-loaded from storage
    this.campaigns = null; // lazy-loaded from storage
    this.photoNames = null; // lazy-loaded: { [photoKey]: displayName }
    this.accounts = null; // lazy-loaded: { [name_lower]: { displayName, pinHash, tokens, createdAt } }
    this.skinData = null; // lazy-loaded: { owned: { [player]: [skinIds] }, custom: { [skinId]: metadata }, equipped: { [player]: skinId } }
    this.lukeHidden = null; // lazy-loaded: { [playerNameLower]: expiresAt }
    this.pushSubscriptions = null; // lazy-loaded: { [playerNameLower]: [ { endpoint, keys } ] }
    this.scoreEpoch = null; // lazy-loaded: integer that increments on each admin reset
    this.activeGames = new Map();      // gameId → GameState
    this.pendingChallenges = new Map(); // chalId → ChallengeState
    this.forfeitTimers = new Map();    // playerName → { timer, gameId }
    this._broadcastPending = false;
    this._debugCounters = { accepted: 0, rejectedEpoch: 0, lastClientEpoch: null, lastSvrEpoch: null };
  }

  // Throttled broadcast: coalesces rapid calls into one broadcast every 2 seconds
  scheduleBroadcast() {
    if (this._broadcastPending) return;
    this._broadcastPending = true;
    setTimeout(() => {
      this._broadcastPending = false;
      this.broadcast();
    }, 2000);
  }

  async loadScoreEpoch() {
    if (this.scoreEpoch === null) {
      this.scoreEpoch = (await this.state.storage.get("scoreEpoch")) || 0;
    }
    return this.scoreEpoch;
  }

  async loadScores() {
    if (this.persistedScores === null) {
      this.persistedScores = (await this.state.storage.get("scores")) || {};
    }
    return this.persistedScores;
  }

  async loadSabotages() {
    if (!this.sabotagesLoaded) {
      this.sabotages = (await this.state.storage.get("sabotages")) || [];
      this.sabotagesLoaded = true;
    }
    // Prune expired
    const now = Date.now();
    this.sabotages = this.sabotages.filter(s => s.expiresAt > now);
    return this.sabotages;
  }

  async saveSabotages() {
    await this.state.storage.put("sabotages", this.sabotages);
  }

  async loadCredits() {
    if (this.credits === null) {
      this.credits = (await this.state.storage.get("credits")) || {};
    }
    return this.credits;
  }

  async saveCredits() {
    await this.state.storage.put("credits", this.credits);
  }

  async addCredits(playerName, count) {
    await this.loadCredits();
    const key = playerName.toLowerCase();
    this.credits[key] = (this.credits[key] || 0) + count;
    await this.saveCredits();
  }

  async useCredit(playerName) {
    await this.loadCredits();
    const key = playerName.toLowerCase();
    const current = this.credits[key] || 0;
    if (current <= 0) {
      return { ok: false, error: "No sabotage credits remaining" };
    }
    this.credits[key] = current - 1;
    await this.saveCredits();
    return { ok: true, remaining: this.credits[key] };
  }

  async addSabotage(attackerName, targetName, durationMs) {
    await this.loadSabotages();
    const expiresAt = Date.now() + (durationMs || 15 * 60 * 1000);
    this.sabotages.push({ targetName, attackerName, expiresAt });
    await this.saveSabotages();
    await this.addSystemChat(attackerName + " slowed down " + targetName + "!");
    this.sendPushToPlayer(targetName, "Sabotaged by " + attackerName + "!", "Half speed!", "sabotage");
    this.broadcast();
  }

  async removeSabotage(targetName) {
    await this.loadSabotages();
    this.sabotages = this.sabotages.filter(function(s) {
      return s.targetName.toLowerCase() !== targetName.toLowerCase();
    });
    await this.saveSabotages();
    await this.addSystemChat(targetName + " broke free!");
    this.broadcast();
  }

  async renameScore(oldName, newName) {
    const scores = await this.loadScores();
    const oldKey = oldName.toLowerCase();
    const newKey = newName.toLowerCase();
    if (oldKey === newKey) return;
    const oldEntry = scores[oldKey];
    if (!oldEntry) return;
    const newEntry = scores[newKey];
    if (newEntry) {
      // Keep the higher score
      if (oldEntry.score > newEntry.score) {
        scores[newKey] = { name: newName, score: oldEntry.score, stats: oldEntry.stats, date: oldEntry.date };
      }
    } else {
      scores[newKey] = { name: newName, score: oldEntry.score, stats: oldEntry.stats, date: oldEntry.date };
    }
    delete scores[oldKey];
    this.persistedScores = scores;
    await this.state.storage.put("scores", scores);
    this.broadcast();
  }

  async saveScore(name, score, stats, clientEpoch) {
    const scores = await this.loadScores();
    const key = name.toLowerCase();
    const s = typeof stats === "object" ? stats : { smellyLevel: stats || "" };
    const existing = scores[key];

    // Reject scores from clients running a stale epoch (pre-reset scores)
    // Only reject when epoch is explicitly provided and stale
    const serverEpoch = await this.loadScoreEpoch();
    if (serverEpoch > 0 && typeof clientEpoch === "number" && clientEpoch < serverEpoch) {
      return;
    }

    // If a server-side cut happened in the last 60s, don't let the client restore a higher score
    if (existing && existing.serverCutAt && (Date.now() - existing.serverCutAt) < 300000 && score > existing.score) {
      existing.stats = s;
      this.persistedScores = scores;
      await this.state.storage.put("scores", scores);
      return;
    }
    if (!existing || score > existing.score) {
      scores[key] = { name, score, stats: s, date: Date.now() };
      this.persistedScores = scores;
      await this.state.storage.put("scores", scores);
    } else {
      // Always update stats even if score hasn't changed
      existing.stats = s;
      this.persistedScores = scores;
      await this.state.storage.put("scores", scores);
    }
  }

  async loadChat() {
    if (this.chatMessages === null) {
      this.chatMessages = (await this.state.storage.get("chatMessages")) || [];
    }
    return this.chatMessages;
  }

  async saveChat() {
    await this.state.storage.put("chatMessages", this.chatMessages);
  }

  async loadCampaigns() {
    if (this.campaigns === null) {
      this.campaigns = (await this.state.storage.get("campaigns")) || {};
    }
    return this.campaigns;
  }

  async saveCampaigns() {
    await this.state.storage.put("campaigns", this.campaigns);
  }

  async loadPhotoNames() {
    if (this.photoNames === null) {
      this.photoNames = (await this.state.storage.get("photoNames")) || {};
    }
    return this.photoNames;
  }

  async savePhotoNames() {
    await this.state.storage.put("photoNames", this.photoNames);
  }

  async loadSkinData() {
    if (this.skinData === null) {
      this.skinData = (await this.state.storage.get("skinData")) || { owned: {}, custom: {}, equipped: {} };
    }
    return this.skinData;
  }

  async saveSkinData() {
    await this.state.storage.put("skinData", this.skinData);
  }

  async loadAccounts() {
    if (this.accounts === null) {
      this.accounts = (await this.state.storage.get("accounts")) || {};
    }
    return this.accounts;
  }

  async saveAccounts() {
    await this.state.storage.put("accounts", this.accounts);
  }

  async loadLukeHidden() {
    if (this.lukeHidden === null) {
      this.lukeHidden = (await this.state.storage.get("lukeHidden")) || {};
    }
    // Prune expired
    const now = Date.now();
    let changed = false;
    for (const key of Object.keys(this.lukeHidden)) {
      if (this.lukeHidden[key] <= now) { delete this.lukeHidden[key]; changed = true; }
    }
    if (changed) await this.state.storage.put("lukeHidden", this.lukeHidden);
    return this.lukeHidden;
  }

  async saveLukeHidden() {
    await this.state.storage.put("lukeHidden", this.lukeHidden);
  }

  async loadPushSubscriptions() {
    if (this.pushSubscriptions === null) {
      this.pushSubscriptions = (await this.state.storage.get("pushSubscriptions")) || {};
    }
    return this.pushSubscriptions;
  }

  async savePushSubscriptions() {
    await this.state.storage.put("pushSubscriptions", this.pushSubscriptions);
  }

  // TODO: Implement full Web Push encryption (RFC 8291) using crypto.subtle.
  // This requires: VAPID JWT signing with ECDSA P-256, ECDH key exchange with
  // the subscription's p256dh key, HKDF key derivation, and AES-128-GCM content
  // encryption. For now this is a stub that logs the notification details.
  // The VAPID private key would come from env.VAPID_PRIVATE_KEY (Wrangler secret)
  // and the public key from env.VAPID_PUBLIC_KEY (wrangler.toml var).
  async sendPushToPlayer(name, title, body, tag, env) {
    const subs = await this.loadPushSubscriptions();
    const key = name.toLowerCase();
    const playerSubs = subs[key];
    if (!playerSubs || playerSubs.length === 0) return;
    console.log("Push notification would be sent to " + name + ": " + title + " - " + body + " (tag: " + tag + ", " + playerSubs.length + " subscription(s))");
  }

  // ===== BATTLE SYSTEM METHODS =====
  sendToPlayer(name, data) {
    const msg = typeof data === 'string' ? data : JSON.stringify(data);
    const lower = name.toLowerCase();
    for (const [ws, info] of this.connections) {
      if (info.name && info.name.toLowerCase() === lower) {
        try { ws.send(msg); } catch (e) {}
      }
    }
  }

  async deductWager(name, amount) {
    const scores = await this.loadScores();
    const key = name.toLowerCase();
    const entry = scores[key];
    if (!entry || entry.score < amount) return false;
    const oldScore = entry.score;
    entry.score -= amount;
    entry.serverCutAt = Date.now();
    this.persistedScores = scores;
    await this.state.storage.put("scores", scores);
    // Send delta so client preserves any local progress above server's knowledge
    this.sendToPlayer(name, { type: "scoreCorrection", targetName: entry.name, newScore: entry.score, delta: -amount });
    return true;
  }

  async awardWinnings(name, amount) {
    const scores = await this.loadScores();
    const key = name.toLowerCase();
    const entry = scores[key];
    if (!entry) return;
    entry.score += amount;
    // No serverCutAt on awards — don't block client from syncing earned coins
    this.persistedScores = scores;
    await this.state.storage.put("scores", scores);
    this.sendToPlayer(name, { type: "scoreCorrection", targetName: entry.name, newScore: entry.score, delta: amount });
  }

  createGame(challenge) {
    const gameId = 'g_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const game = {
      id: gameId, type: challenge.gameType,
      player1: challenge.challengerName, player2: challenge.targetName,
      wagerCoins: challenge.wagerCoins,
      p1Source: challenge.challengerSource || 'score',
      p2Source: challenge.targetSource || 'score',
      round: 1, maxRounds: 1, p1Score: 0, p2Score: 0,
      winner: null, createdAt: Date.now(),
    };
    if (challenge.gameType === 'rps') {
      game.rpsRound = { p1Move: null, p2Move: null };
      game.rpsResults = [];
    } else if (challenge.gameType === 'ttt') {
      game.tttBoard = [null, null, null, null, null, null, null, null, null];
      game.tttCurrentTurn = Math.random() < 0.5 ? game.player1 : game.player2;
      game.tttSymbols = {};
      game.tttSymbols[game.player1] = 'X';
      game.tttSymbols[game.player2] = 'O';
    } else if (challenge.gameType === 'trivia') {
      const q = TRIVIA_BANK[Math.floor(Math.random() * TRIVIA_BANK.length)];
      game.triviaQuestion = q.q;
      game.triviaAnswers = q.a;
      game.triviaCorrectIndex = q.c;
      game.triviaP1Answer = null; game.triviaP1Time = null;
      game.triviaP2Answer = null; game.triviaP2Time = null;
      game.triviaStartedAt = Date.now();
    }
    if (challenge.gameType === 'coinflip') {
      game.coinFlipResult = Math.random() < 0.5 ? 'heads' : 'tails';
      game.winner = Math.random() < 0.5 ? game.player1 : game.player2;
    } else if (challenge.gameType === 'reaction') {
      game.reactionDelay = 2000 + Math.floor(Math.random() * 6000);
      game.reactionGoAt = Date.now() + game.reactionDelay;
      game.reactionP1Tap = null;
      game.reactionP2Tap = null;
      game.reactionP1FalseStart = false;
      game.reactionP2FalseStart = false;
    } else if (challenge.gameType === 'connect4') {
      game.c4Board = [];
      for (var ci = 0; ci < 7; ci++) game.c4Board.push([null,null,null,null,null,null]);
      game.c4CurrentTurn = Math.random() < 0.5 ? game.player1 : game.player2;
      game.c4Symbols = {};
      game.c4Symbols[game.player1] = 'R';
      game.c4Symbols[game.player2] = 'Y';
    } else if (challenge.gameType === 'hangman') {
      var word = HANGMAN_WORDS[Math.floor(Math.random() * HANGMAN_WORDS.length)];
      game.hangmanWord = word;
      game.hangmanP1Guesses = [];
      game.hangmanP2Guesses = [];
      game.hangmanP1Wrong = 0;
      game.hangmanP2Wrong = 0;
      game.hangmanMaxWrong = 6;
    } else if (challenge.gameType === 'battleship') {
      // 8x8 grids (simplified). Each player places 5 ships then fires shots.
      // Ships: sizes 5,4,3,3,2. Auto-placed randomly by server.
      game.bsSize = 8;
      game.bsShips = { p1: this.randomShipPlacement(8), p2: this.randomShipPlacement(8) };
      game.bsShots = { p1: [], p2: [] }; // [{x,y,hit}]
      game.bsCurrentTurn = Math.random() < 0.5 ? game.player1 : game.player2;
      game.bsSunk = { p1: 0, p2: 0 }; // count of sunk ships
      game.bsTotalShips = 5;
      // Spectator support
      game.spectators = [];
      game.spectatorChat = [];
      game.spectatorBets = []; // {name, betOn, amount}
    }
    this.activeGames.set(gameId, game);
    return game;
  }

  async processMove(game, playerName, move) {
    const isP1 = game.player1.toLowerCase() === playerName.toLowerCase();
    const isP2 = game.player2.toLowerCase() === playerName.toLowerCase();
    if (!isP1 && !isP2) return;

    if (game.type === 'rps') {
      const valid = ['rock', 'paper', 'scissors'];
      if (!valid.includes(move)) return;
      if (isP1 && game.rpsRound.p1Move) return;
      if (isP2 && game.rpsRound.p2Move) return;
      if (isP1) game.rpsRound.p1Move = move;
      if (isP2) game.rpsRound.p2Move = move;
      this.sendToPlayer(game.player1, { type: "gameUpdate", game: this.sanitizeGame(game, game.player1) });
      this.sendToPlayer(game.player2, { type: "gameUpdate", game: this.sanitizeGame(game, game.player2) });
      if (game.rpsRound.p1Move && game.rpsRound.p2Move) {
        const result = this.resolveRps(game.rpsRound.p1Move, game.rpsRound.p2Move);
        const reveal = { p1Move: game.rpsRound.p1Move, p2Move: game.rpsRound.p2Move, result };
        game.rpsResults.push(reveal);
        if (result === 'p1') game.p1Score++;
        else if (result === 'p2') game.p2Score++;
        const roundsNeeded = Math.ceil(game.maxRounds / 2);
        if (game.p1Score >= roundsNeeded || game.p2Score >= roundsNeeded || game.rpsResults.length >= game.maxRounds) {
          if (game.p1Score > game.p2Score) game.winner = game.player1;
          else if (game.p2Score > game.p1Score) game.winner = game.player2;
          else game.winner = 'draw';
          this.sendToPlayer(game.player1, { type: "gameUpdate", game: { ...this.sanitizeGame(game, game.player1), rpsReveal: reveal } });
          this.sendToPlayer(game.player2, { type: "gameUpdate", game: { ...this.sanitizeGame(game, game.player2), rpsReveal: reveal } });
          await this.endGame(game, 'completed');
        } else {
          // Send reveal first
          this.sendToPlayer(game.player1, { type: "gameUpdate", game: { ...this.sanitizeGame(game, game.player1), rpsReveal: reveal } });
          this.sendToPlayer(game.player2, { type: "gameUpdate", game: { ...this.sanitizeGame(game, game.player2), rpsReveal: reveal } });
          // Reset for next round
          game.rpsRound = { p1Move: null, p2Move: null };
          game.round++;
          // Send updated state after delay so clients see the reveal then get pick buttons
          const self2 = this;
          setTimeout(function() {
            self2.sendToPlayer(game.player1, { type: "gameUpdate", game: self2.sanitizeGame(game, game.player1) });
            self2.sendToPlayer(game.player2, { type: "gameUpdate", game: self2.sanitizeGame(game, game.player2) });
          }, 2000);
        }
      }
    } else if (game.type === 'ttt') {
      const cell = parseInt(move);
      if (isNaN(cell) || cell < 0 || cell > 8) return;
      if (game.tttBoard[cell] !== null) return;
      if (game.tttCurrentTurn.toLowerCase() !== playerName.toLowerCase()) return;
      const sym = isP1 ? game.tttSymbols[game.player1] : game.tttSymbols[game.player2];
      game.tttBoard[cell] = sym;
      const winResult = this.checkTttWinner(game.tttBoard);
      if (winResult) {
        game.winner = winResult === 'draw' ? 'draw' : playerName;
        this.sendToPlayer(game.player1, { type: "gameUpdate", game: this.sanitizeGame(game, game.player1) });
        this.sendToPlayer(game.player2, { type: "gameUpdate", game: this.sanitizeGame(game, game.player2) });
        await this.endGame(game, 'completed');
      } else {
        game.tttCurrentTurn = isP1 ? game.player2 : game.player1;
        this.sendToPlayer(game.player1, { type: "gameUpdate", game: this.sanitizeGame(game, game.player1) });
        this.sendToPlayer(game.player2, { type: "gameUpdate", game: this.sanitizeGame(game, game.player2) });
      }
    } else if (game.type === 'trivia') {
      const answerIdx = parseInt(move);
      if (isNaN(answerIdx) || answerIdx < 0 || answerIdx > 3) return;
      const now = Date.now();
      if (isP1 && game.triviaP1Answer === null) { game.triviaP1Answer = answerIdx; game.triviaP1Time = now - game.triviaStartedAt; }
      if (isP2 && game.triviaP2Answer === null) { game.triviaP2Answer = answerIdx; game.triviaP2Time = now - game.triviaStartedAt; }
      if (game.triviaP1Answer !== null && game.triviaP2Answer !== null) {
        const p1c = game.triviaP1Answer === game.triviaCorrectIndex;
        const p2c = game.triviaP2Answer === game.triviaCorrectIndex;
        if (p1c && p2c) game.winner = game.triviaP1Time <= game.triviaP2Time ? game.player1 : game.player2;
        else if (p1c) game.winner = game.player1;
        else if (p2c) game.winner = game.player2;
        else game.winner = 'draw';
        await this.endGame(game, 'completed');
      } else {
        this.sendToPlayer(game.player1, { type: "gameUpdate", game: this.sanitizeGame(game, game.player1) });
        this.sendToPlayer(game.player2, { type: "gameUpdate", game: this.sanitizeGame(game, game.player2) });
      }
    } else if (game.type === 'reaction') {
      if (move !== 'tap') return;
      const now = Date.now();
      if (isP1 && game.reactionP1Tap !== null) return;
      if (isP2 && game.reactionP2Tap !== null) return;
      const isBeforeGo = now < game.reactionGoAt;
      if (isP1) { game.reactionP1Tap = now; if (isBeforeGo) game.reactionP1FalseStart = true; }
      if (isP2) { game.reactionP2Tap = now; if (isBeforeGo) game.reactionP2FalseStart = true; }
      if (game.reactionP1FalseStart || game.reactionP2FalseStart) {
        if (game.reactionP1FalseStart && game.reactionP2FalseStart) game.winner = 'draw';
        else if (game.reactionP1FalseStart) game.winner = game.player2;
        else game.winner = game.player1;
        this.sendToPlayer(game.player1, { type: "gameUpdate", game: this.sanitizeGame(game, game.player1) });
        this.sendToPlayer(game.player2, { type: "gameUpdate", game: this.sanitizeGame(game, game.player2) });
        await this.endGame(game, 'completed');
      } else if (game.reactionP1Tap && game.reactionP2Tap) {
        game.reactionP1Time = game.reactionP1Tap - game.reactionGoAt;
        game.reactionP2Time = game.reactionP2Tap - game.reactionGoAt;
        game.winner = game.reactionP1Time <= game.reactionP2Time ? game.player1 : game.player2;
        this.sendToPlayer(game.player1, { type: "gameUpdate", game: this.sanitizeGame(game, game.player1) });
        this.sendToPlayer(game.player2, { type: "gameUpdate", game: this.sanitizeGame(game, game.player2) });
        await this.endGame(game, 'completed');
      } else {
        this.sendToPlayer(game.player1, { type: "gameUpdate", game: this.sanitizeGame(game, game.player1) });
        this.sendToPlayer(game.player2, { type: "gameUpdate", game: this.sanitizeGame(game, game.player2) });
      }
    } else if (game.type === 'connect4') {
      const col = parseInt(move);
      if (isNaN(col) || col < 0 || col > 6) return;
      if (game.c4CurrentTurn.toLowerCase() !== playerName.toLowerCase()) return;
      const column = game.c4Board[col];
      let row = -1;
      for (let r = 0; r < 6; r++) { if (column[r] === null) { row = r; break; } }
      if (row === -1) return;
      const c4sym = isP1 ? game.c4Symbols[game.player1] : game.c4Symbols[game.player2];
      column[row] = c4sym;
      const c4win = this.checkC4Winner(game.c4Board, col, row, c4sym);
      if (c4win) {
        game.winner = c4win === 'draw' ? 'draw' : playerName;
        this.sendToPlayer(game.player1, { type: "gameUpdate", game: this.sanitizeGame(game, game.player1) });
        this.sendToPlayer(game.player2, { type: "gameUpdate", game: this.sanitizeGame(game, game.player2) });
        await this.endGame(game, 'completed');
      } else {
        game.c4CurrentTurn = isP1 ? game.player2 : game.player1;
        this.sendToPlayer(game.player1, { type: "gameUpdate", game: this.sanitizeGame(game, game.player1) });
        this.sendToPlayer(game.player2, { type: "gameUpdate", game: this.sanitizeGame(game, game.player2) });
      }
    } else if (game.type === 'hangman') {
      const letter = String(move).toUpperCase().charAt(0);
      if (!/[A-Z]/.test(letter)) return;
      const guesses = isP1 ? game.hangmanP1Guesses : game.hangmanP2Guesses;
      if (guesses.includes(letter)) return;
      guesses.push(letter);
      if (!game.hangmanWord.includes(letter)) {
        if (isP1) game.hangmanP1Wrong++;
        else game.hangmanP2Wrong++;
      }
      // Check if this player completed the word
      const wordLetters = game.hangmanWord.split('').filter(function(v, i, a) { return a.indexOf(v) === i; });
      const p1Done = wordLetters.every(function(l) { return game.hangmanP1Guesses.includes(l); });
      const p2Done = wordLetters.every(function(l) { return game.hangmanP2Guesses.includes(l); });
      const p1Dead = game.hangmanP1Wrong >= game.hangmanMaxWrong;
      const p2Dead = game.hangmanP2Wrong >= game.hangmanMaxWrong;
      if (p1Done && !p2Done) game.winner = game.player1;
      else if (p2Done && !p1Done) game.winner = game.player2;
      else if (p1Done && p2Done) game.winner = 'draw';
      else if (p1Dead && p2Dead) game.winner = 'draw';
      else if (p1Dead) game.winner = game.player2;
      else if (p2Dead) game.winner = game.player1;
      if (game.winner) {
        this.sendToPlayer(game.player1, { type: "gameUpdate", game: { ...game } });
        this.sendToPlayer(game.player2, { type: "gameUpdate", game: { ...game } });
        await this.endGame(game, 'completed');
      } else {
        this.sendToPlayer(game.player1, { type: "gameUpdate", game: this.sanitizeGame(game, game.player1) });
        this.sendToPlayer(game.player2, { type: "gameUpdate", game: this.sanitizeGame(game, game.player2) });
      }
    } else if (game.type === 'battleship') {
      if (game.bsCurrentTurn.toLowerCase() !== playerName.toLowerCase()) return;
      const coords = String(move).split(',');
      const x = parseInt(coords[0]), y = parseInt(coords[1]);
      if (isNaN(x) || isNaN(y) || x < 0 || x >= game.bsSize || y < 0 || y >= game.bsSize) return;
      const myShots = isP1 ? game.bsShots.p1 : game.bsShots.p2;
      if (myShots.some(function(s) { return s.x === x && s.y === y; })) return; // already shot there
      const enemyShips = isP1 ? game.bsShips.p2 : game.bsShips.p1;
      const result = this.checkBsHit(enemyShips, x, y);
      myShots.push({ x, y, hit: result.hit });
      // Check if ship sunk
      let sunkCount = 0;
      for (const ship of enemyShips) {
        if (this.checkBsShipSunk(ship, myShots)) sunkCount++;
      }
      if (isP1) game.bsSunk.p1 = sunkCount;
      else game.bsSunk.p2 = sunkCount;
      // Check win (all enemy ships sunk)
      if (sunkCount >= game.bsTotalShips) {
        game.winner = playerName;
        this.sendToPlayer(game.player1, { type: "gameUpdate", game: this.sanitizeGame(game, game.player1) });
        this.sendToPlayer(game.player2, { type: "gameUpdate", game: this.sanitizeGame(game, game.player2) });
        // Notify spectators
        this.broadcastToSpectators(game);
        await this.endGame(game, 'completed');
        // Resolve spectator bets
        await this.resolveSpectatorBets(game);
      } else {
        game.bsCurrentTurn = isP1 ? game.player2 : game.player1;
        this.sendToPlayer(game.player1, { type: "gameUpdate", game: this.sanitizeGame(game, game.player1) });
        this.sendToPlayer(game.player2, { type: "gameUpdate", game: this.sanitizeGame(game, game.player2) });
        this.broadcastToSpectators(game);
      }
    }
  }

  resolveRps(m1, m2) {
    if (m1 === m2) return 'draw';
    if ((m1 === 'rock' && m2 === 'scissors') || (m1 === 'paper' && m2 === 'rock') || (m1 === 'scissors' && m2 === 'paper')) return 'p1';
    return 'p2';
  }

  checkTttWinner(board) {
    const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    for (const [a, b, c] of lines) {
      if (board[a] && board[a] === board[b] && board[b] === board[c]) return board[a];
    }
    return board.every(cell => cell !== null) ? 'draw' : null;
  }

  checkC4Winner(board, lastCol, lastRow, sym) {
    const dirs = [[1,0],[0,1],[1,1],[1,-1]];
    for (const [dc, dr] of dirs) {
      let count = 1;
      for (let i = 1; i < 4; i++) { const c = lastCol+dc*i, r = lastRow+dr*i; if (c<0||c>6||r<0||r>5||board[c][r]!==sym) break; count++; }
      for (let i = 1; i < 4; i++) { const c = lastCol-dc*i, r = lastRow-dr*i; if (c<0||c>6||r<0||r>5||board[c][r]!==sym) break; count++; }
      if (count >= 4) return sym;
    }
    let full = true;
    for (let c = 0; c < 7; c++) { if (board[c][5] === null) { full = false; break; } }
    return full ? 'draw' : null;
  }

  randomShipPlacement(size) {
    const ships = [5, 4, 3, 3, 2];
    const grid = [];
    for (let i = 0; i < size; i++) { grid.push([]); for (let j = 0; j < size; j++) grid[i].push(false); }
    const placed = [];
    for (const len of ships) {
      let attempts = 0;
      while (attempts < 100) {
        attempts++;
        const horiz = Math.random() < 0.5;
        const x = Math.floor(Math.random() * (horiz ? size - len + 1 : size));
        const y = Math.floor(Math.random() * (horiz ? size : size - len + 1));
        let ok = true;
        const cells = [];
        for (let i = 0; i < len; i++) {
          const cx = horiz ? x + i : x;
          const cy = horiz ? y : y + i;
          if (grid[cx][cy]) { ok = false; break; }
          cells.push({ x: cx, y: cy });
        }
        if (ok) {
          for (const c of cells) grid[c.x][c.y] = true;
          placed.push(cells);
          break;
        }
      }
    }
    return placed; // array of ships, each ship is array of {x,y}
  }

  checkBsHit(ships, x, y) {
    for (let si = 0; si < ships.length; si++) {
      for (const cell of ships[si]) {
        if (cell.x === x && cell.y === y) return { hit: true, shipIndex: si };
      }
    }
    return { hit: false };
  }

  checkBsShipSunk(ship, shots) {
    return ship.every(function(cell) {
      return shots.some(function(s) { return s.x === cell.x && s.y === cell.y && s.hit; });
    });
  }

  // ===== SPECTATOR SYSTEM =====
  broadcastToSpectators(game) {
    if (!game.spectators || game.spectators.length === 0) return;
    const spectatorView = this.sanitizeGameForSpectator(game);
    const msg = JSON.stringify({ type: "spectatorUpdate", game: spectatorView });
    for (const specName of game.spectators) {
      this.sendToPlayer(specName, { type: "spectatorUpdate", game: spectatorView });
    }
  }

  sanitizeGameForSpectator(game) {
    const g = { ...game };
    // Hide both players' ship positions in battleship
    if (game.type === 'battleship') {
      g.bsShips = undefined;
      // Show shots and sunk counts only
    }
    // Hide RPS moves until revealed
    if (game.type === 'rps' && game.rpsRound) {
      g.rpsRound = { p1Move: game.rpsRound.p1Move ? 'hidden' : null, p2Move: game.rpsRound.p2Move ? 'hidden' : null };
    }
    // Hide trivia answers
    if (game.type === 'trivia') {
      g.triviaCorrectIndex = undefined;
      g.triviaP1Answer = game.triviaP1Answer !== null ? 'hidden' : null;
      g.triviaP2Answer = game.triviaP2Answer !== null ? 'hidden' : null;
    }
    g.spectatorChat = game.spectatorChat || [];
    return g;
  }

  async resolveSpectatorBets(game) {
    if (!game.spectatorBets || game.spectatorBets.length === 0) return;
    if (!game.winner || game.winner === 'draw') {
      // Refund all bets
      for (const bet of game.spectatorBets) {
        await this.awardWinnings(bet.name, bet.amount);
      }
      return;
    }
    // Separate winners and losers
    const winners = game.spectatorBets.filter(function(b) { return b.betOn.toLowerCase() === game.winner.toLowerCase(); });
    const losers = game.spectatorBets.filter(function(b) { return b.betOn.toLowerCase() !== game.winner.toLowerCase(); });
    const totalPool = game.spectatorBets.reduce(function(s, b) { return s + b.amount; }, 0);
    const winnerPool = winners.reduce(function(s, b) { return s + b.amount; }, 0);
    if (winnerPool === 0) {
      // No correct bets — refund everyone
      for (const bet of game.spectatorBets) {
        await this.awardWinnings(bet.name, bet.amount);
      }
      return;
    }
    // Distribute total pool proportionally to winners
    for (const bet of winners) {
      const payout = Math.floor(totalPool * (bet.amount / winnerPool));
      if (payout > 0) await this.awardWinnings(bet.name, payout);
      this.sendToPlayer(bet.name, { type: "spectatorBetResult", won: true, payout: payout, gameId: game.id });
    }
    for (const bet of losers) {
      this.sendToPlayer(bet.name, { type: "spectatorBetResult", won: false, payout: 0, gameId: game.id });
    }
  }

  async endGame(game, reason) {
    if (game.winner === 'draw') {
      // Refund each player to their chosen source
      if ((game.p1Source || 'score') === 'score') await this.awardWinnings(game.player1, game.wagerCoins);
      else this.sendToPlayer(game.player1, { type: 'walletAward', amount: game.wagerCoins });
      if ((game.p2Source || 'score') === 'score') await this.awardWinnings(game.player2, game.wagerCoins);
      else this.sendToPlayer(game.player2, { type: 'walletAward', amount: game.wagerCoins });
    } else if (game.winner) {
      // Winner receives 2x to their chosen source
      const winSource = game.winner === game.player1 ? (game.p1Source || 'score') : (game.p2Source || 'score');
      if (winSource === 'score') await this.awardWinnings(game.winner, game.wagerCoins * 2);
      else this.sendToPlayer(game.winner, { type: 'walletAward', amount: game.wagerCoins * 2 });
    }
    const names = { rps: 'Rock Paper Scissors', ttt: 'Tic-Tac-Toe', trivia: 'Trivia', coinflip: 'Coin Flip', reaction: 'Reaction Race', connect4: 'Connect 4', hangman: 'Hangman', battleship: 'Battleship' };
    const tn = names[game.type] || game.type;
    if (game.winner === 'draw') {
      await this.addSystemChat('\u2694\uFE0F ' + game.player1 + ' vs ' + game.player2 + ' in ' + tn + ' \u2014 DRAW! Wagers refunded.');
    } else if (reason === 'forfeit') {
      await this.addSystemChat('\u2694\uFE0F ' + game.winner + ' wins ' + (game.wagerCoins * 2) + ' coins in ' + tn + ' \u2014 opponent disconnected!');
    } else if (game.winner) {
      const loser = game.winner === game.player1 ? game.player2 : game.player1;
      await this.addSystemChat('\u2694\uFE0F ' + game.winner + ' defeats ' + loser + ' in ' + tn + ' and wins ' + (game.wagerCoins * 2) + ' coins!');
    }
    this.sendToPlayer(game.player1, { type: "gameEnded", game: game, reason });
    this.sendToPlayer(game.player2, { type: "gameEnded", game: game, reason });
    // Push notify the loser
    if (game.winner && game.winner !== 'draw') {
      const loser = game.winner === game.player1 ? game.player2 : game.player1;
      this.sendPushToPlayer(loser, "Lost to " + game.winner + "!", "-" + game.wagerCoins + " coins", "game-result");
    }
    const self = this;
    setTimeout(() => { self.activeGames.delete(game.id); }, 60000);
    this.scheduleBroadcast();
  }

  sanitizeGame(game, forPlayer) {
    const g = { ...game };
    if (game.type === 'rps' && game.rpsRound) {
      g.rpsRound = { ...game.rpsRound };
      if (forPlayer.toLowerCase() === game.player1.toLowerCase()) {
        g.rpsRound.p2Move = game.rpsRound.p2Move ? 'hidden' : null;
      } else {
        g.rpsRound.p1Move = game.rpsRound.p1Move ? 'hidden' : null;
      }
    }
    if (game.type === 'trivia') {
      g.triviaCorrectIndex = undefined;
      if (forPlayer.toLowerCase() === game.player1.toLowerCase()) {
        g.triviaP2Answer = game.triviaP2Answer !== null ? 'hidden' : null;
        g.triviaP2Time = undefined;
      } else {
        g.triviaP1Answer = game.triviaP1Answer !== null ? 'hidden' : null;
        g.triviaP1Time = undefined;
      }
    }
    if (game.type === 'battleship') {
      // Hide opponent's ship positions, show only their shots against you
      if (forPlayer.toLowerCase() === game.player1.toLowerCase()) {
        g.bsShips = { p1: game.bsShips.p1, p2: undefined }; // see own ships only
      } else {
        g.bsShips = { p1: undefined, p2: game.bsShips.p2 };
      }
    }
    if (game.type === 'reaction' && !game.winner) {
      if (forPlayer.toLowerCase() === game.player1.toLowerCase()) {
        g.reactionP2Tap = game.reactionP2Tap !== null ? 'hidden' : null;
      } else {
        g.reactionP1Tap = game.reactionP1Tap !== null ? 'hidden' : null;
      }
    }
    if (game.type === 'hangman') {
      // Hide opponent's guesses so they can't piggyback
      if (forPlayer.toLowerCase() === game.player1.toLowerCase()) {
        g.hangmanP2Guesses = undefined; g.hangmanP2Wrong = undefined;
      } else {
        g.hangmanP1Guesses = undefined; g.hangmanP1Wrong = undefined;
      }
      // Send masked word showing only letters the player has guessed
      if (!game.winner) {
        var myGuesses = forPlayer.toLowerCase() === game.player1.toLowerCase() ? game.hangmanP1Guesses : game.hangmanP2Guesses;
        g.hangmanMasked = game.hangmanWord.split('').map(function(ch) { return (myGuesses || []).includes(ch) ? ch : '_'; }).join('');
        g.hangmanWord = undefined;
      }
    }
    return g;
  }

  async generateToken() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
  }

  async findAccountByToken(token) {
    const accounts = await this.loadAccounts();
    for (const [key, account] of Object.entries(accounts)) {
      if (account.tokens && account.tokens.includes(token)) {
        return { key, account };
      }
    }
    return null;
  }

  async addSystemChat(message) {
    await this.loadChat();
    var entry = { type: "chat", name: "SYSTEM", message: message, timestamp: Date.now() };
    this.chatMessages.push(entry);
    if (this.chatMessages.length > 500) this.chatMessages = this.chatMessages.slice(-500);
    await this.saveChat();
    this.broadcastChat(entry);
  }

  filterProfanity(text) {
    var badWords = [
      'fuck','fucker','fuckin','fucking','fucked','fucks','fuk','fck','f u c k','phuck','phuk',
      'shit','shits','shitty','sh1t','s h i t',
      'ass','asses','asshole','assholes','a s s',
      'bitch','bitches','b1tch','b!tch',
      'damn','damned','dammit','d a m n',
      'hell',
      'dick','dicks','d1ck',
      'cock','cocks','c0ck',
      'pussy','pussies','pu55y',
      'cunt','cunts','c u n t',
      'bastard','bastards',
      'whore','whores','wh0re',
      'slut','sluts','sl ut',
      'nigger','nigga','n1gger','n1gga',
      'faggot','fag','f4g',
      'retard','retarded',
    ];
    // Sort longest first so compound words (e.g. "asshole") match before "ass"
    badWords.sort(function(a, b) { return b.length - a.length; });
    var result = text;
    for (var i = 0; i < badWords.length; i++) {
      var word = badWords[i];
      var escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Use word boundaries so "ass" doesn't match inside "passive" or "class"
      var re = new RegExp('\\b' + escaped + '\\b', 'gi');
      result = result.replace(re, '*'.repeat(word.length));
    }
    return result;
  }

  broadcastChat(msg) {
    var data = JSON.stringify(msg);
    for (var [ws] of this.connections) {
      try { ws.send(data); } catch (e) { this.connections.delete(ws); }
    }
  }

  async fetch(request) {
    const url = new URL(request.url);

    // Credits: get count for a player
    if (url.pathname === "/credits/get" && request.method === "POST") {
      const body = await request.json();
      const playerName = String(body.playerName || "").slice(0, 20);
      if (!playerName) {
        return new Response(JSON.stringify({ error: "playerName required" }), { status: 400 });
      }
      const credits = await this.loadCredits();
      const key = playerName.toLowerCase();
      return new Response(JSON.stringify({ credits: credits[key] || 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Credits: use one credit
    if (url.pathname === "/credits/use" && request.method === "POST") {
      const body = await request.json();
      const playerName = String(body.playerName || "").slice(0, 20);
      if (!playerName) {
        return new Response(JSON.stringify({ error: "playerName required" }), { status: 400 });
      }
      const result = await this.useCredit(playerName);
      if (!result.ok) {
        return new Response(JSON.stringify({ error: result.error }), { status: 400 });
      }
      this.broadcast();
      return new Response(JSON.stringify({ ok: true, remaining: result.remaining }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Credits: add credits for a player
    if (url.pathname === "/credits/add" && request.method === "POST") {
      const body = await request.json();
      const playerName = String(body.playerName || "").slice(0, 20);
      const count = Math.floor(Number(body.count) || 0);
      if (!playerName || count <= 0) {
        return new Response(JSON.stringify({ error: "playerName and positive count required" }), { status: 400 });
      }
      await this.addCredits(playerName, count);
      this.broadcast();
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Photo names: get all overrides
    if (url.pathname === "/photo-names/get" && request.method === "GET") {
      const photoNames = await this.loadPhotoNames();
      return new Response(JSON.stringify(photoNames), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Photo names: set one override
    // Debug: expose DO state (temporary)
    if (url.pathname === "/debug-state") {
      const scores = await this.loadScores();
      const epoch = await this.loadScoreEpoch();
      const connCount = this.connections.size;
      const connScores = [];
      for (const [, info] of this.connections) {
        if (info.name) connScores.push({ name: info.name, score: info.score || 0 });
      }
      const scoreKeys = Object.keys(scores);
      const topScores = Object.values(scores).sort((a,b) => b.score - a.score).slice(0, 10);
      const activeSabs = await this.loadSabotages();
      return new Response(JSON.stringify({ epoch, connCount, connScores: connScores.slice(0, 20), persistedScoreCount: scoreKeys.length, topPersistedScores: topScores, broadcastPending: this._broadcastPending, debug: this._debugCounters, sabotages: activeSabs }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.pathname === "/photo-names/set" && request.method === "POST") {
      const body = await request.json();
      const key = String(body.key || "");
      const displayName = String(body.displayName || "").slice(0, 30);
      if (!key) {
        return new Response(JSON.stringify({ error: "key required" }), { status: 400 });
      }
      const photoNames = await this.loadPhotoNames();
      if (displayName) {
        photoNames[key] = displayName;
      } else {
        delete photoNames[key];
      }
      this.photoNames = photoNames;
      await this.savePhotoNames();
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Admin: reset all scores
    if (url.pathname === "/admin/reset-scores" && request.method === "POST") {
      // 1. Clear persisted scores
      this.persistedScores = {};
      await this.state.storage.put("scores", {});

      // 2. Increment score epoch — clients with stale epochs are rejected
      const newEpoch = (await this.loadScoreEpoch()) + 1;
      this.scoreEpoch = newEpoch;
      await this.state.storage.put("scoreEpoch", newEpoch);

      // 3. Clear all in-memory connection scores so broadcast doesn't re-add them
      for (const [, info] of this.connections) {
        info.score = 0;
      }

      // 4. Clear gameState from all accounts so login doesn't restore old scores
      const accounts = await this.loadAccounts();
      for (const key of Object.keys(accounts)) {
        if (accounts[key].gameState) {
          accounts[key].gameState = null;
          accounts[key].gameStateUpdatedAt = null;
        }
      }
      this.accounts = accounts;
      await this.saveAccounts();

      // 5. Reset lastPodium so podium change detection starts fresh
      this.lastPodium = [];

      await this.addSystemChat("ADMIN reset all scores!");

      // 6. Send resetAll event with new epoch to every client
      const resetMsg = JSON.stringify({ type: "resetAll", scoreEpoch: newEpoch });
      for (const [ws] of this.connections) {
        try { ws.send(resetMsg); } catch (e) {}
      }

      // 7. Broadcast clean state
      this.broadcast();
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Admin: reset individual player score
    if (url.pathname === "/admin/reset-player" && request.method === "POST") {
      const body = await request.json();
      const targetName = String(body.playerName || "").trim();
      if (!targetName) {
        return new Response(JSON.stringify({ error: "playerName required" }), { status: 400, headers: { "Content-Type": "application/json" } });
      }
      const targetKey = targetName.toLowerCase();

      // 1. Zero persisted score + set serverCutAt to block re-uploads
      const scores = await this.loadScores();
      if (scores[targetKey]) {
        scores[targetKey].score = 0;
        scores[targetKey].serverCutAt = Date.now();
        scores[targetKey].stats = { smellyLevel: "" };
      }
      this.persistedScores = scores;
      await this.state.storage.put("scores", scores);

      // 2. Zero all connected clients with this name + send them resetAll
      const svrEpoch = await this.loadScoreEpoch();
      const resetMsg = JSON.stringify({ type: "resetAll", scoreEpoch: svrEpoch });
      for (const [ws, info] of this.connections) {
        if (info.name && info.name.toLowerCase() === targetKey) {
          info.score = 0;
          info.stats = {};
          try { ws.send(resetMsg); } catch (e) {}
        }
      }

      // 3. Clear account gameState for this player
      const accounts = await this.loadAccounts();
      if (accounts[targetKey] && accounts[targetKey].gameState) {
        accounts[targetKey].gameState = null;
        accounts[targetKey].gameStateUpdatedAt = null;
        this.accounts = accounts;
        await this.saveAccounts();
      }

      await this.addSystemChat("ADMIN reset " + targetName + "'s score!");
      this.broadcast();
      return new Response(JSON.stringify({ ok: true, player: targetName }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Admin: add coins to individual player
    if (url.pathname === "/admin/add-coins" && request.method === "POST") {
      const body = await request.json();
      const targetName = String(body.playerName || "").trim();
      const amount = Math.floor(Number(body.amount) || 0);
      if (!targetName || amount <= 0) {
        return new Response(JSON.stringify({ error: "playerName and positive amount required" }), { status: 400, headers: { "Content-Type": "application/json" } });
      }
      const targetKey = targetName.toLowerCase();

      // 1. Add to persisted score
      const scores = await this.loadScores();
      if (scores[targetKey]) {
        scores[targetKey].score += amount;
      } else {
        scores[targetKey] = { name: targetName, score: amount, stats: { smellyLevel: "" }, date: Date.now() };
      }
      this.persistedScores = scores;
      await this.state.storage.put("scores", scores);

      // 2. Update connected clients + send scoreCorrection so their local state updates
      var correctionMsg = JSON.stringify({ type: "scoreCorrection", targetName: targetName, newScore: scores[targetKey].score, delta: amount });
      for (const [ws, info] of this.connections) {
        if (info.name && info.name.toLowerCase() === targetKey) {
          info.score = scores[targetKey].score;
          try { ws.send(correctionMsg); } catch (e) {}
        }
      }

      await this.addSystemChat("ADMIN gave " + targetName + " " + amount.toLocaleString() + " coins!");
      this.broadcast();
      return new Response(JSON.stringify({ ok: true, player: targetName, newScore: scores[targetKey].score }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Broadcast raised amount to all clients
    if (url.pathname === "/broadcast-raised" && request.method === "POST") {
      const body = await request.json();
      var raisedMsg = JSON.stringify({ type: "totalRaised", totalRaisedCents: body.totalRaisedCents, transactionCount: body.transactionCount });
      for (var [ws] of this.connections) {
        try { ws.send(raisedMsg); } catch(e) { this.connections.delete(ws); }
      }
      return new Response("ok");
    }

    // Unsabotage endpoint
    if (url.pathname === "/unsabotage" && request.method === "POST") {
      const body = await request.json();
      const targetName = String(body.targetName || "").slice(0, 20);
      if (!targetName) {
        return new Response(JSON.stringify({ error: "targetName required" }), { status: 400 });
      }
      await this.removeSabotage(targetName);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Break-free price lookup
    if (url.pathname === "/break-free-price" && request.method === "POST") {
      const body = await request.json();
      const targetName = String(body.targetName || "").slice(0, 20);
      await this.loadSabotages();
      const now = Date.now();
      let totalFreezeCents = 0;
      let hasFreezeActive = false;
      for (const s of this.sabotages) {
        if (s.targetName.toLowerCase() === targetName.toLowerCase() && s.expiresAt > now) {
          if (s.freeze) {
            hasFreezeActive = true;
            totalFreezeCents += (s.priceCents || 200);
          }
        }
      }
      const priceCents = hasFreezeActive ? totalFreezeCents : 99;
      return new Response(JSON.stringify({ priceCents }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Import score endpoint (used by migration)
    if (url.pathname === "/import-score" && request.method === "POST") {
      const body = await request.json();
      if (body.name && body.score) {
        await this.saveScore(String(body.name).slice(0, 20), Math.floor(body.score));
      }
      return new Response("ok");
    }

    // Coin Cut endpoint: reduce target's score by a percentage
    if (url.pathname === "/coincut" && request.method === "POST") {
      const body = await request.json();
      const attackerName = String(body.attackerName || "").slice(0, 20);
      const targetName = String(body.targetName || "").slice(0, 20);
      const percentage = Math.floor(Number(body.percentage) || 0);
      const allowedPcts = [1,5,10,15,20,25,30,35,40];
      if (!attackerName || !targetName) {
        return new Response(JSON.stringify({ error: "attackerName and targetName required" }), { status: 400 });
      }
      if (allowedPcts.indexOf(percentage) < 0) {
        return new Response(JSON.stringify({ error: "Invalid percentage" }), { status: 400 });
      }
      const scores = await this.loadScores();
      const targetKey = targetName.toLowerCase();
      if (!scores[targetKey]) {
        return new Response(JSON.stringify({ error: "Target not found" }), { status: 404 });
      }
      const oldScore = scores[targetKey].score;
      const removed = Math.floor(oldScore * (percentage / 100));
      const newScore = oldScore - removed;
      scores[targetKey].score = newScore;
      scores[targetKey].serverCutAt = Date.now();
      this.persistedScores = scores;
      await this.state.storage.put("scores", scores);
      await this.addSystemChat(attackerName + " cut " + targetName + "'s coins by " + percentage + "%! They lost " + removed.toLocaleString() + " coins!");
      // Broadcast coin cut event for popup notifications + score correction for target client
      var cutEvent = { type: "coinCutEvent", attackerName: attackerName, targetName: targetName, percentage: percentage, removed: removed, newScore: newScore, timestamp: Date.now() };
      var cutEventData = JSON.stringify(cutEvent);
      var correctionMsg = JSON.stringify({ type: "scoreCorrection", targetName: targetName, newScore: newScore, delta: -removed });
      for (var [ws] of this.connections) {
        try { ws.send(cutEventData); ws.send(correctionMsg); } catch(e) { this.connections.delete(ws); }
      }
      this.sendPushToPlayer(targetName, attackerName + " cut your coins by " + percentage + "%!", "You lost " + removed.toLocaleString() + " coins!", "coincut");
      this.broadcast();
      return new Response(JSON.stringify({ ok: true, removed, newScore }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Campaign: create a new pooled coin cut campaign
    if (url.pathname === "/campaign/create" && request.method === "POST") {
      const body = await request.json();
      const attackerName = String(body.attackerName || "").slice(0, 20);
      const targetName = String(body.targetName || "").slice(0, 20);
      const percentage = Math.floor(Number(body.percentage) || 0);
      const targetScore = Math.floor(Number(body.targetScore) || 0);
      const allowedPcts = [1,5,10,15,20,25,30,35,40];
      if (!attackerName || !targetName) {
        return new Response(JSON.stringify({ error: "attackerName and targetName required" }), { status: 400 });
      }
      if (allowedPcts.indexOf(percentage) < 0) {
        return new Response(JSON.stringify({ error: "Invalid percentage" }), { status: 400 });
      }
      const dollars = Math.max(Math.ceil(percentage / 10), Math.min(50, Math.floor(Math.log10(Math.max(targetScore, 10)) * (percentage / 100) * 3.5)));
      const totalPriceCents = dollars * 100;
      const campaigns = await this.loadCampaigns();
      const id = "camp_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
      campaigns[id] = {
        id: id,
        creatorName: attackerName,
        targetName: targetName,
        percentage: percentage,
        targetScore: targetScore,
        totalPriceCents: totalPriceCents,
        contributedCents: 0,
        contributors: [],
        createdAt: Date.now(),
        status: "active",
      };
      this.campaigns = campaigns;
      await this.saveCampaigns();
      await this.addSystemChat(attackerName + " started a campaign to cut " + targetName + "'s coins by " + percentage + "%! $" + dollars + " needed.");
      this.broadcast();
      return new Response(JSON.stringify({ ok: true, campaign: campaigns[id] }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Campaign: create a TOTAL WIPE campaign ($100 pooled)
    if (url.pathname === "/campaign/create-wipe" && request.method === "POST") {
      const body = await request.json();
      const attackerName = String(body.attackerName || "").slice(0, 20);
      const targetName = String(body.targetName || "").slice(0, 20);
      if (!attackerName || !targetName) {
        return new Response(JSON.stringify({ error: "attackerName and targetName required" }), { status: 400 });
      }
      const campaigns = await this.loadCampaigns();
      // Check if there's already an active wipe campaign against this player
      for (const key of Object.keys(campaigns)) {
        const c = campaigns[key];
        if (c.status === "active" && c.type === "wipe" && c.targetName.toLowerCase() === targetName.toLowerCase()) {
          return new Response(JSON.stringify({ error: "A wipe campaign against " + targetName + " is already active!" }), { status: 400, headers: { "Content-Type": "application/json" } });
        }
      }
      const totalPriceCents = 10000; // $100
      const id = "wipe_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
      campaigns[id] = {
        id: id,
        type: "wipe",
        creatorName: attackerName,
        targetName: targetName,
        totalPriceCents: totalPriceCents,
        contributedCents: 0,
        contributors: [],
        createdAt: Date.now(),
        status: "active",
      };
      this.campaigns = campaigns;
      await this.saveCampaigns();
      await this.addSystemChat("\uD83D\uDCA3 " + attackerName + " started a TOTAL WIPE campaign against " + targetName + "! $100 needed to obliterate ALL their coins, upgrades, and progress!");
      this.broadcast();
      return new Response(JSON.stringify({ ok: true, campaign: campaigns[id] }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Campaign: contribute to a campaign
    if (url.pathname === "/campaign/contribute" && request.method === "POST") {
      const body = await request.json();
      const campaignId = String(body.campaignId || "");
      const contributorName = String(body.contributorName || "").slice(0, 20);
      const cents = Math.floor(Number(body.cents) || 0);
      const premiumCents = Math.floor(Number(body.premiumCents) || 0);
      if (!campaignId || !contributorName || cents <= 0) {
        return new Response(JSON.stringify({ error: "campaignId, contributorName, and positive cents required" }), { status: 400 });
      }
      const campaigns = await this.loadCampaigns();
      const campaign = campaigns[campaignId];
      if (!campaign || campaign.status !== "active") {
        return new Response(JSON.stringify({ error: "Campaign not found or already completed" }), { status: 404 });
      }
      campaign.contributedCents += cents;
      campaign.contributors.push({ name: contributorName, cents: cents, premiumCents: premiumCents });
      var completed = false;
      if (campaign.contributedCents >= campaign.totalPriceCents) {
        campaign.status = "completed";
        campaign.completedAt = Date.now();

        if (campaign.type === "wipe") {
          // TOTAL WIPE: reset everything — score, upgrades, wallet, all of it
          const targetKey = campaign.targetName.toLowerCase();
          const scores = await this.loadScores();
          if (scores[targetKey]) {
            scores[targetKey].score = 0;
            scores[targetKey].serverCutAt = Date.now();
            scores[targetKey].stats = { smellyLevel: "" };
          }
          this.persistedScores = scores;
          await this.state.storage.put("scores", scores);

          // Zero all connected clients with this name + send resetAll to wipe their browser
          const svrEpoch = await this.loadScoreEpoch();
          const wipeMsg = JSON.stringify({ type: "resetAll", scoreEpoch: svrEpoch });
          for (const [ws, info] of this.connections) {
            if (info.name && info.name.toLowerCase() === targetKey) {
              info.score = 0;
              info.stats = {};
              try { ws.send(wipeMsg); } catch (e) {}
            }
          }

          // Clear account gameState
          const accounts = await this.loadAccounts();
          if (accounts[targetKey] && accounts[targetKey].gameState) {
            accounts[targetKey].gameState = null;
            accounts[targetKey].gameStateUpdatedAt = null;
            this.accounts = accounts;
            await this.saveAccounts();
          }

          await this.addSystemChat("\uD83D\uDCA3\uD83D\uDCA5 TOTAL WIPE COMPLETE! " + campaign.targetName + " has been OBLITERATED! All coins, upgrades, and progress — GONE! See you, buddy!");
        } else {
          // Regular coin cut campaign
          const scores = await this.loadScores();
          const targetKey = campaign.targetName.toLowerCase();
          if (scores[targetKey]) {
            const oldScore = scores[targetKey].score;
            const removed = Math.floor(oldScore * (campaign.percentage / 100));
            const newScore = oldScore - removed;
            scores[targetKey].score = newScore;
            scores[targetKey].serverCutAt = Date.now();
            this.persistedScores = scores;

            // Distribute looted coins to premium payers proportionally
            const totalPremium = campaign.contributors.reduce(function(sum, c) { return sum + (c.premiumCents || 0); }, 0);
            var lootMessages = [];
            if (totalPremium > 0 && removed > 0) {
              for (var ci = 0; ci < campaign.contributors.length; ci++) {
                var contrib = campaign.contributors[ci];
                if (contrib.premiumCents > 0) {
                  var share = Math.floor(removed * (contrib.premiumCents / totalPremium));
                  if (share > 0) {
                    var contribKey = contrib.name.toLowerCase();
                    if (!scores[contribKey]) {
                      scores[contribKey] = { name: contrib.name, score: 0, stats: {} };
                    }
                    scores[contribKey].score += share;
                    lootMessages.push({ name: contrib.name, share: share });
                  }
                }
              }
            }

            await this.state.storage.put("scores", scores);

            var lootSummary = "";
            if (lootMessages.length > 0) {
              var lootParts = [];
              for (var li = 0; li < lootMessages.length; li++) {
                lootParts.push(lootMessages[li].name + " +" + lootMessages[li].share.toLocaleString());
              }
              lootSummary = " Loot: " + lootParts.join(", ") + "!";
            }
            await this.addSystemChat("Campaign complete! " + campaign.targetName + "'s coins were cut by " + campaign.percentage + "%! They lost " + removed.toLocaleString() + " coins!" + lootSummary);

            var campCorrectionMsg = JSON.stringify({ type: "scoreCorrection", targetName: campaign.targetName, newScore: newScore, delta: -removed });
            for (var [ws] of this.connections) {
              try { ws.send(campCorrectionMsg); } catch(e) { this.connections.delete(ws); }
            }
            for (var lmi = 0; lmi < lootMessages.length; lmi++) {
              var lootKey = lootMessages[lmi].name.toLowerCase();
              var lootCorrectionMsg = JSON.stringify({ type: "scoreCorrection", targetName: lootMessages[lmi].name, newScore: scores[lootKey].score, delta: lootMessages[lmi].share });
              for (var [ws2] of this.connections) {
                try { ws2.send(lootCorrectionMsg); } catch(e) { this.connections.delete(ws2); }
              }
            }
          }
        }
        completed = true;
      } else {
        var contribDollars = (cents / 100).toFixed(2);
        var remaining = ((campaign.totalPriceCents - campaign.contributedCents) / 100).toFixed(2);
        var lootNote = premiumCents > 0 ? " (with loot premium)" : "";
        var campaignTypeLabel = campaign.type === "wipe" ? " to WIPE " + campaign.targetName + "!" : " to cut " + campaign.targetName + "'s coins!";
        await this.addSystemChat(contributorName + " chipped in $" + contribDollars + lootNote + campaignTypeLabel + " $" + remaining + " to go.");
      }
      this.campaigns = campaigns;
      await this.saveCampaigns();
      this.broadcast();
      return new Response(JSON.stringify({ ok: true, completed: completed, campaign: campaign }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Campaign: cancel
    if (url.pathname === "/campaign/cancel" && request.method === "POST") {
      const body = await request.json();
      const campaignId = String(body.campaignId || "");
      const requesterName = String(body.requesterName || "").slice(0, 20);
      if (!campaignId || !requesterName) {
        return new Response(JSON.stringify({ error: "campaignId and requesterName required" }), { status: 400 });
      }
      const campaigns = await this.loadCampaigns();
      const campaign = campaigns[campaignId];
      if (!campaign) {
        return new Response(JSON.stringify({ error: "Campaign not found" }), { status: 404 });
      }
      if (requesterName !== "ADMIN" && campaign.creatorName && campaign.creatorName.toLowerCase() !== requesterName.toLowerCase()) {
        return new Response(JSON.stringify({ error: "Only the creator can cancel this campaign" }), { status: 403 });
      }
      if (campaign.status !== "active") {
        return new Response(JSON.stringify({ error: "Campaign is not active" }), { status: 400 });
      }
      campaign.status = "cancelled";
      this.campaigns = campaigns;
      await this.saveCampaigns();
      await this.addSystemChat(requesterName + " cancelled the campaign against " + campaign.targetName + ".");
      this.broadcast();
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Account: register
    if (url.pathname === "/account/register" && request.method === "POST") {
      const body = await request.json();
      const name = String(body.name || "").slice(0, 20).trim();
      const pin = String(body.pin || "").trim();
      if (!name || pin.length < 4) {
        return new Response(JSON.stringify({ error: "Name and PIN (4+ digits) required" }), { status: 400, headers: { "Content-Type": "application/json" } });
      }
      const accounts = await this.loadAccounts();
      const key = name.toLowerCase();
      if (accounts[key]) {
        return new Response(JSON.stringify({ error: "Account already exists. Please log in instead." }), { status: 409, headers: { "Content-Type": "application/json" } });
      }
      const pinHash = await hashPassword(pin);
      const token = await this.generateToken();
      accounts[key] = { displayName: name, pinHash, tokens: [token], createdAt: Date.now() };
      this.accounts = accounts;
      await this.saveAccounts();
      const scores = await this.loadScores();
      const existingScore = scores[key] ? scores[key].score : 0;
      return new Response(JSON.stringify({ ok: true, token, displayName: name, score: existingScore }), { headers: { "Content-Type": "application/json" } });
    }

    // Account: login
    if (url.pathname === "/account/login" && request.method === "POST") {
      const body = await request.json();
      const name = String(body.name || "").slice(0, 20).trim();
      const pin = String(body.pin || "").trim();
      if (!name || !pin) {
        return new Response(JSON.stringify({ error: "Name and PIN required" }), { status: 400, headers: { "Content-Type": "application/json" } });
      }
      const accounts = await this.loadAccounts();
      const key = name.toLowerCase();
      const account = accounts[key];
      if (!account) {
        return new Response(JSON.stringify({ error: "No account found for that name. Register first!" }), { status: 404, headers: { "Content-Type": "application/json" } });
      }
      const pinHash = await hashPassword(pin);
      if (!safeCompare(pinHash, account.pinHash)) {
        return new Response(JSON.stringify({ error: "Incorrect PIN" }), { status: 401, headers: { "Content-Type": "application/json" } });
      }
      const token = await this.generateToken();
      account.tokens = account.tokens || [];
      account.tokens.push(token);
      if (account.tokens.length > 10) account.tokens = account.tokens.slice(-10);
      await this.saveAccounts();
      const scores = await this.loadScores();
      const entry = scores[key] || null;
      return new Response(JSON.stringify({ ok: true, token, displayName: account.displayName, score: entry ? entry.score : 0, stats: entry ? entry.stats : null, gameState: account.gameState || null }), { headers: { "Content-Type": "application/json" } });
    }

    // Account: logout (revoke token)
    if (url.pathname === "/account/logout" && request.method === "POST") {
      const body = await request.json();
      const token = String(body.token || "");
      if (token) {
        const found = await this.findAccountByToken(token);
        if (found) {
          found.account.tokens = found.account.tokens.filter(t => t !== token);
          await this.saveAccounts();
        }
      }
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }

    // Account: merge a duplicate score entry into this account (takes max score)
    if (url.pathname === "/account/merge" && request.method === "POST") {
      const body = await request.json();
      const token = String(body.token || "");
      const mergeFromName = String(body.mergeFromName || "").slice(0, 20).trim();
      if (!token || !mergeFromName) {
        return new Response(JSON.stringify({ error: "token and mergeFromName required" }), { status: 400, headers: { "Content-Type": "application/json" } });
      }
      const found = await this.findAccountByToken(token);
      if (!found) {
        return new Response(JSON.stringify({ error: "Invalid or expired token" }), { status: 401, headers: { "Content-Type": "application/json" } });
      }
      const { key: accountKey, account } = found;
      const fromKey = mergeFromName.toLowerCase();
      if (fromKey === accountKey) {
        return new Response(JSON.stringify({ error: "Cannot merge with yourself" }), { status: 400, headers: { "Content-Type": "application/json" } });
      }
      const scores = await this.loadScores();
      if (!scores[fromKey]) {
        return new Response(JSON.stringify({ error: "No score entry found for that name" }), { status: 404, headers: { "Content-Type": "application/json" } });
      }
      const myScore = scores[accountKey] ? scores[accountKey].score : 0;
      const theirScore = scores[fromKey].score;
      const mergedScore = Math.max(myScore, theirScore);
      if (scores[accountKey]) {
        scores[accountKey].score = mergedScore;
        delete scores[accountKey].serverCutAt;
      } else {
        scores[accountKey] = { name: account.displayName, score: mergedScore, date: Date.now() };
      }
      delete scores[fromKey];
      this.persistedScores = scores;
      await this.state.storage.put("scores", scores);
      this.broadcast();
      return new Response(JSON.stringify({ ok: true, newScore: mergedScore }), { headers: { "Content-Type": "application/json" } });
    }

    // Campaign: get all active campaigns
    if (url.pathname === "/campaigns" && request.method === "GET") {
      const campaigns = await this.loadCampaigns();
      const now = Date.now();
      const active = [];
      for (const key of Object.keys(campaigns)) {
        const c = campaigns[key];
        if (c.status === "active") {
          active.push(c);
        } else if (c.status === "completed" && c.completedAt && (now - c.completedAt) < 5 * 60 * 1000) {
          active.push(c);
        }
      }
      return new Response(JSON.stringify(active), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Skin: get owned skins for a player
    if (url.pathname === "/skins/owned" && request.method === "GET") {
      var playerName = url.searchParams.get("player") || "";
      var skinData = await this.loadSkinData();
      var key = playerName.toLowerCase();
      var owned = skinData.owned[key] || [];
      return new Response(JSON.stringify(owned), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Skin: get custom skins for a player
    if (url.pathname === "/skins/custom" && request.method === "GET") {
      var playerName = url.searchParams.get("player") || "";
      var skinData = await this.loadSkinData();
      var key = playerName.toLowerCase();
      var owned = skinData.owned[key] || [];
      var customs = [];
      for (var i = 0; i < owned.length; i++) {
        if (skinData.custom[owned[i]]) {
          var c = skinData.custom[owned[i]];
          customs.push({
            id: owned[i],
            name: c.name || (c.description || "Custom").slice(0, 30),
            description: c.description,
            creatorName: c.creatorName || "",
            color: "#a78bfa",
            priceCents: 599,
            owned: true,
            custom: true,
            assets: (c.assets || []).map(function(a) { return "/skins/" + owned[i] + "/" + a + ".png"; }),
          });
        }
      }
      return new Response(JSON.stringify(customs), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Skin: unlock a skin for a player
    if (url.pathname === "/skins/unlock" && request.method === "POST") {
      var body = await request.json();
      var skinId = String(body.skinId || "");
      var playerName = String(body.playerName || "").slice(0, 20);
      var skinData = await this.loadSkinData();
      var key = playerName.toLowerCase();
      if (!skinData.owned[key]) skinData.owned[key] = [];
      if (skinData.owned[key].indexOf(skinId) < 0) {
        skinData.owned[key].push(skinId);
      }
      this.skinData = skinData;
      await this.saveSkinData();
      await this.addSystemChat(playerName + " unlocked the " + skinId + " skin pack!");
      this.broadcast();
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Skin: save custom skin metadata
    if (url.pathname === "/skins/save-custom" && request.method === "POST") {
      var body = await request.json();
      var skinData = await this.loadSkinData();
      var key = body.playerName.toLowerCase();
      skinData.custom[body.skinId] = {
        description: body.description,
        assets: body.assets,
        apiCostCents: body.apiCostCents,
        totalOutputTokens: body.totalOutputTokens,
        totalInputTokens: body.totalInputTokens,
        creatorName: body.playerName,
        createdAt: Date.now(),
      };
      if (!skinData.owned[key]) skinData.owned[key] = [];
      if (skinData.owned[key].indexOf(body.skinId) < 0) {
        skinData.owned[key].push(body.skinId);
      }
      this.skinData = skinData;
      await this.saveSkinData();
      await this.addSystemChat(body.playerName + " created a custom skin pack!");
      this.broadcast();
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Skin: update custom skin name/description (creator only)
    if (url.pathname === "/skins/update-meta" && request.method === "POST") {
      var body = await request.json();
      var skinId = String(body.skinId || "");
      var playerName = String(body.playerName || "").slice(0, 20);
      var newName = String(body.name || "").slice(0, 30);
      var newDesc = String(body.description || "").slice(0, 200);
      var skinData = await this.loadSkinData();
      var custom = skinData.custom[skinId];
      if (!custom) {
        return new Response(JSON.stringify({ error: "Skin not found" }), { status: 404 });
      }
      // Allow editing if you're the creator OR if you own it and no creator is set
      var key2 = playerName.toLowerCase();
      var owned2 = skinData.owned[key2] || [];
      var isCreator = custom.creatorName && custom.creatorName.toLowerCase() === playerName.toLowerCase();
      var isOwner = owned2.indexOf(skinId) >= 0;
      if (!isCreator && !isOwner) {
        return new Response(JSON.stringify({ error: "Only the creator can edit this skin" }), { status: 403 });
      }
      // Set creatorName if not already set
      if (!custom.creatorName) custom.creatorName = playerName;
      if (newName) custom.name = newName;
      if (newDesc) custom.description = newDesc;
      this.skinData = skinData;
      await this.saveSkinData();
      this.broadcast();
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Skin: regenerate a custom skin (one free regen allowed)
    if (url.pathname === "/skins/regenerate" && request.method === "POST") {
      var body = await request.json();
      var skinId = String(body.skinId || "");
      var playerName = String(body.playerName || "").slice(0, 20);
      var skinData = await this.loadSkinData();
      var custom = skinData.custom[skinId];
      if (!custom) {
        return new Response(JSON.stringify({ error: "Skin not found" }), { status: 404 });
      }
      // Verify ownership
      var key = playerName.toLowerCase();
      var owned = skinData.owned[key] || [];
      if (owned.indexOf(skinId) < 0) {
        return new Response(JSON.stringify({ error: "You don't own this skin" }), { status: 403 });
      }
      // Check if free regen already used
      if (custom.regenUsed) {
        return new Response(JSON.stringify({ error: "Free regeneration already used for this skin" }), { status: 400 });
      }
      // Mark regen as used (will be saved after generation completes in outer handler)
      custom.regenUsed = true;
      this.skinData = skinData;
      await this.saveSkinData();
      return new Response(JSON.stringify({ ok: true, description: custom.description }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Skin: update API cost after regeneration
    if (url.pathname === "/skins/update-api-cost" && request.method === "POST") {
      var body = await request.json();
      var skinId = String(body.skinId || "");
      var additionalCostCents = Math.floor(Number(body.additionalCostCents) || 0);
      var skinData = await this.loadSkinData();
      var custom = skinData.custom[skinId];
      if (custom) {
        custom.apiCostCents = (custom.apiCostCents || 0) + additionalCostCents;
        custom.totalOutputTokens = (custom.totalOutputTokens || 0) + (body.totalOutputTokens || 0);
        custom.totalInputTokens = (custom.totalInputTokens || 0) + (body.totalInputTokens || 0);
        this.skinData = skinData;
        await this.saveSkinData();
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Skin: total API costs across all custom skins
    if (url.pathname === "/skins/total-api-cost" && request.method === "GET") {
      var skinData = await this.loadSkinData();
      var total = 0;
      for (var sid in skinData.custom) {
        total += (skinData.custom[sid].apiCostCents || 0);
      }
      return new Response(JSON.stringify({ totalApiCostCents: total }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Skin: equip a skin
    if (url.pathname === "/skins/equip" && request.method === "POST") {
      var body = await request.json();
      var skinId = String(body.skinId || "");
      var playerName = String(body.playerName || "").slice(0, 20);
      var skinData = await this.loadSkinData();
      var key = playerName.toLowerCase();
      skinData.equipped[key] = skinId;
      this.skinData = skinData;
      await this.saveSkinData();
      this.broadcast();
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Skin: publish a custom skin to the marketplace
    if (url.pathname === "/skins/publish" && request.method === "POST") {
      var body = await request.json();
      var skinId = String(body.skinId || "");
      var playerName = String(body.playerName || "").slice(0, 20);
      var skinData = await this.loadSkinData();
      var custom = skinData.custom[skinId];
      if (!custom) {
        return new Response(JSON.stringify({ error: "Custom skin not found" }), { status: 404 });
      }
      // Verify ownership
      var key = playerName.toLowerCase();
      var owned = skinData.owned[key] || [];
      if (owned.indexOf(skinId) < 0) {
        return new Response(JSON.stringify({ error: "You don't own this skin" }), { status: 403 });
      }
      custom.published = true;
      custom.creatorName = playerName;
      this.skinData = skinData;
      await this.saveSkinData();
      await this.addSystemChat(playerName + " published a custom skin to the marketplace: " + (custom.description || "").slice(0, 40));
      this.broadcast();
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Skin: get all published community skins
    if (url.pathname === "/skins/marketplace" && request.method === "GET") {
      var skinData = await this.loadSkinData();
      var published = [];
      for (var sid in skinData.custom) {
        var c = skinData.custom[sid];
        if (c.published) {
          published.push({
            id: sid,
            name: c.name || (c.description || "Custom").slice(0, 30),
            description: c.description || "",
            creatorName: c.creatorName || "Unknown",
            color: "#a78bfa",
            priceCents: 599,
            custom: true,
            community: true,
            assets: (c.assets || []).map(function(a) { return "/skins/" + sid + "/" + a + ".png"; }),
          });
        }
      }
      return new Response(JSON.stringify(published), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Freeze endpoint (0x multiplier for 5 min)
    if (url.pathname === "/freeze" && request.method === "POST") {
      const body = await request.json();
      const attackerName = String(body.attackerName || "").slice(0, 20);
      const targetName = String(body.targetName || "").slice(0, 20);
      if (!attackerName || !targetName) {
        return new Response(JSON.stringify({ error: "attackerName and targetName required" }), { status: 400 });
      }
      await this.loadSabotages();
      const allowedMins = [2,5,10,15,30,60,120,180,240,360];
      const rawMin = Math.floor(Number(body.durationMin) || 2);
      const durationMin = allowedMins.indexOf(rawMin) >= 0 ? rawMin : 2;
      const expiresAt = Date.now() + durationMin * 60 * 1000;
      const priceCents = Number(body.priceCents) || 200;
      this.sabotages.push({ targetName, attackerName, expiresAt, freeze: true, priceCents });
      await this.saveSabotages();
      const durLabel = durationMin >= 60 ? (durationMin / 60) + " hr" : durationMin + " min";
      await this.addSystemChat(attackerName + " FROZE " + targetName + " for " + durLabel + "!");
      this.broadcast();
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Sabotage endpoint
    if (url.pathname === "/sabotage" && request.method === "POST") {
      const body = await request.json();
      const attackerName = String(body.attackerName || "").slice(0, 20);
      const targetName = String(body.targetName || "").slice(0, 20);
      if (!attackerName || !targetName) {
        return new Response(JSON.stringify({ error: "attackerName and targetName required" }), { status: 400 });
      }
      var durationMs = body.durationMs ? Math.min(Number(body.durationMs), 24 * 60 * 60 * 1000) : undefined;
      await this.addSabotage(attackerName, targetName, durationMs);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Admin: get all scores
    if (url.pathname === "/admin/all-scores" && request.method === "GET") {
      const scores = await this.loadScores();
      const list = Object.values(scores)
        .sort((a, b) => b.score - a.score);
      return new Response(JSON.stringify(list), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Admin: delete a score by name key
    if (url.pathname === "/admin/delete-score" && request.method === "POST") {
      const body = await request.json();
      const key = String(body.name || "").toLowerCase();
      if (!key) {
        return new Response(JSON.stringify({ error: "name required" }), { status: 400 });
      }
      const scores = await this.loadScores();
      if (scores[key]) {
        delete scores[key];
        this.persistedScores = scores;
        await this.state.storage.put("scores", scores);
        this.broadcast(); // refresh all clients
        return new Response(JSON.stringify({ ok: true, deleted: key }), {
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    }

    // Hide Luke (server-side tracking)
    if (url.pathname === "/hide-luke" && request.method === "POST") {
      try {
        const body = await request.json();
        const pName = String(body.playerName || "").slice(0, 20);
        const durationMs = Math.min(body.durationMs || 3600000, 24 * 3600000); // max 24h, default 1h
        if (!pName) return new Response(JSON.stringify({ error: "playerName required" }), { status: 400, headers: { "Content-Type": "application/json" } });
        const lh = await this.loadLukeHidden();
        lh[pName.toLowerCase()] = Date.now() + durationMs;
        await this.saveLukeHidden();
        // Notify the player
        this.sendToPlayer(pName, { type: "lukeHiddenUpdate", hidden: true, expiresAt: lh[pName.toLowerCase()] });
        return new Response(JSON.stringify({ ok: true, expiresAt: lh[pName.toLowerCase()] }), { headers: { "Content-Type": "application/json" } });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
    }

    // Rematch handler (forwarded from outer handler after payment verification)
    if (url.pathname === "/rematch" && request.method === "POST") {
      try {
        const body = await request.json();
        const oldGame = this.activeGames.get(body.gameId);
        if (!oldGame) return new Response(JSON.stringify({ error: "Game not found or expired" }), { status: 404, headers: { "Content-Type": "application/json" } });
        if (!oldGame.winner || oldGame.winner === 'draw') return new Response(JSON.stringify({ error: "Game not eligible for rematch" }), { status: 400, headers: { "Content-Type": "application/json" } });
        // Create new best-of-3 game with round 1 result carried over
        const loser = oldGame.winner === oldGame.player1 ? oldGame.player2 : oldGame.player1;
        const challenge = {
          challengerName: oldGame.player1, targetName: oldGame.player2,
          gameType: oldGame.type, wagerCoins: oldGame.wagerCoins,
        };
        const newGame = this.createGame(challenge);
        newGame.maxRounds = 3;
        // Carry over round 1 result - winner of original game gets 1 point
        if (oldGame.winner === newGame.player1) newGame.p1Score = 1;
        else newGame.p2Score = 1;
        newGame.round = 2;
        if (newGame.type === 'rps') {
          newGame.rpsResults = [{ p1Move: 'carried', p2Move: 'carried', result: oldGame.winner === newGame.player1 ? 'p1' : 'p2' }];
        }
        // No re-wagering - original pot stays, loser paid $1.99 for the chance
        await this.addSystemChat('\u2694\uFE0F REMATCH! ' + newGame.player1 + ' vs ' + newGame.player2 + ' \u2014 Best 2 of 3!');
        this.sendToPlayer(newGame.player1, { type: "gameStarted", game: this.sanitizeGame(newGame, newGame.player1) });
        this.sendToPlayer(newGame.player2, { type: "gameStarted", game: this.sanitizeGame(newGame, newGame.player2) });
        return new Response(JSON.stringify({ ok: true, gameId: newGame.id }), { headers: { "Content-Type": "application/json" } });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
    }

    // Push: subscribe
    if (url.pathname === "/push/subscribe" && request.method === "POST") {
      const body = await request.json();
      const playerName = String(body.playerName || "").slice(0, 20);
      const subscription = body.subscription;
      if (!playerName || !subscription || !subscription.endpoint) {
        return new Response(JSON.stringify({ error: "playerName and subscription required" }), { status: 400, headers: { "Content-Type": "application/json" } });
      }
      const subs = await this.loadPushSubscriptions();
      const key = playerName.toLowerCase();
      if (!subs[key]) subs[key] = [];
      // Deduplicate by endpoint
      subs[key] = subs[key].filter(function(s) { return s.endpoint !== subscription.endpoint; });
      subs[key].push(subscription);
      // Keep max 5 subscriptions per player (multiple devices)
      if (subs[key].length > 5) subs[key] = subs[key].slice(-5);
      this.pushSubscriptions = subs;
      await this.savePushSubscriptions();
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }

    // Push: unsubscribe
    if (url.pathname === "/push/unsubscribe" && request.method === "POST") {
      const body = await request.json();
      const playerName = String(body.playerName || "").slice(0, 20);
      const endpoint = String(body.endpoint || "");
      if (!playerName || !endpoint) {
        return new Response(JSON.stringify({ error: "playerName and endpoint required" }), { status: 400, headers: { "Content-Type": "application/json" } });
      }
      const subs = await this.loadPushSubscriptions();
      const key = playerName.toLowerCase();
      if (subs[key]) {
        subs[key] = subs[key].filter(function(s) { return s.endpoint !== endpoint; });
        if (subs[key].length === 0) delete subs[key];
        this.pushSubscriptions = subs;
        await this.savePushSubscriptions();
      }
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }

    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    const country = request.headers.get("CF-IPCountry") || "??";
    const city = request.cf?.city || "";

    server.accept();
    this.connections.set(server, { country, city, joinedAt: Date.now() });

    // Send chat history to new connection
    this.loadChat().then((msgs) => {
      if (msgs.length > 0) {
        try {
          server.send(JSON.stringify({ type: "chatHistory", messages: msgs }));
        } catch (e) {}
      }
    });

    // Eagerly load epoch so it's cached for the sync message handler
    this.loadScoreEpoch();

    this.broadcast();

    server.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(event.data);
        const info = this.connections.get(server);
        if (!info) return;

        if (msg.type === "setName" && msg.name) {
          var oldName = info.name || "";
          info.name = String(msg.name).slice(0, 20);
          if (msg.deviceId) {
            info.deviceId = String(msg.deviceId).slice(0, 64);
          }
          if (oldName && oldName !== info.name) {
            this.renameScore(oldName, info.name);
          }
          // Cancel forfeit timer on reconnection
          var fKey = info.name.toLowerCase();
          if (this.forfeitTimers.has(fKey)) {
            clearTimeout(this.forfeitTimers.get(fKey).timer);
            this.forfeitTimers.delete(fKey);
          }
        }

        if (msg.type === "setIdentity") {
          var oldName = info.name || "";
          if (msg.deviceId) {
            info.deviceId = String(msg.deviceId).slice(0, 64);
          }
          if (msg.name) {
            info.name = String(msg.name).slice(0, 20);
          } else if (info.deviceId) {
            // Try to find a name from another connection with the same deviceId
            for (var [otherWs, otherInfo] of this.connections) {
              if (otherWs !== server && otherInfo.deviceId === info.deviceId && otherInfo.name) {
                info.name = otherInfo.name;
                break;
              }
            }
          }
          if (oldName && info.name && oldName !== info.name) {
            this.renameScore(oldName, info.name);
          }
        }

        if (msg.type === "scoreUpdate" && msg.name && typeof msg.score === "number") {
          info.name = String(msg.name).slice(0, 20);

          // Check epoch BEFORE accepting the score into memory
          // Use cached epoch (loaded by broadcast on connection open) to avoid async
          var clientEpoch = typeof msg.scoreEpoch === "number" ? msg.scoreEpoch : undefined;
          var svrEpoch = this.scoreEpoch || 0;

          // Only reject if client explicitly sends a stale epoch number
          // Clients without epoch support (old versions) are allowed through
          if (svrEpoch > 0 && typeof clientEpoch === "number" && clientEpoch < svrEpoch) {
            info.score = 0;
            try { server.send(JSON.stringify({ type: "resetAll", scoreEpoch: svrEpoch })); } catch(e) {}
            return;
          }
          info.score = Math.floor(msg.score);
          info.stats = {
            smellyLevel: msg.smellyLevel || "",
            totalClicks: Math.floor(msg.totalClicks || 0),
            sightings: Math.floor(msg.sightings || 0),
            coinsPerClick: Math.floor(msg.coinsPerClick || 0),
            coinsPerSecond: Math.floor(msg.coinsPerSecond || 0),
          };
          this.saveScore(info.name, info.score, info.stats, clientEpoch);
          this.scheduleBroadcast();
          // Save full game state for cross-device sync if authenticated
          if (msg.authToken && msg.gameState) {
            this.findAccountByToken(msg.authToken).then(found => {
              if (found) {
                found.account.gameState = msg.gameState;
                found.account.gameStateUpdatedAt = Date.now();
                this.saveAccounts();
              }
            });
          }
        }

        if (msg.type === "chat" && msg.message && info.name) {
          var cleanMsg = this.filterProfanity(String(msg.message).slice(0, 200));
          var chatEntry = { type: "chat", name: info.name, message: cleanMsg, timestamp: Date.now() };
          this.loadChat().then(() => {
            this.chatMessages.push(chatEntry);
            if (this.chatMessages.length > 500) this.chatMessages = this.chatMessages.slice(-500);
            this.saveChat();
            this.broadcastChat(chatEntry);
          });
          return;
        }

        // ===== BATTLE SYSTEM WS HANDLERS =====
        if (msg.type === "challenge" && info.name && msg.targetName && msg.gameType && typeof msg.wagerCoins === "number") {
          const self = this;
          (async () => {
            const validTypes = ['rps', 'ttt', 'trivia', 'coinflip', 'reaction', 'connect4', 'hangman', 'battleship'];
            if (!validTypes.includes(msg.gameType)) return;
            const wager = Math.floor(msg.wagerCoins);
            if (wager < 100 || wager > 10000000) return;
            if (info.name.toLowerCase() === msg.targetName.toLowerCase()) return;
            const scores = await self.loadScores();
            const cScore = (scores[info.name.toLowerCase()] && scores[info.name.toLowerCase()].score) || 0;
            const tScore = (scores[msg.targetName.toLowerCase()] && scores[msg.targetName.toLowerCase()].score) || 0;
            if (wager > cScore || wager > tScore) return;
            const chalId = 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
            const challenge = {
              id: chalId, challengerName: info.name, targetName: msg.targetName,
              gameType: msg.gameType, wagerCoins: wager,
              challengerSource: msg.wagerSource === 'wallet' ? 'wallet' : 'score',
              createdAt: Date.now(), expiresAt: Date.now() + 60000,
            };
            self.pendingChallenges.set(chalId, challenge);
            setTimeout(() => {
              if (self.pendingChallenges.has(chalId)) {
                self.pendingChallenges.delete(chalId);
                self.sendToPlayer(challenge.challengerName, { type: "challengeExpired", challengeId: chalId });
                self.sendToPlayer(challenge.targetName, { type: "challengeExpired", challengeId: chalId });
              }
            }, 60000);
            self.sendToPlayer(msg.targetName, { type: "challengeReceived", challenge });
            self.sendToPlayer(info.name, { type: "challengeSent", challenge });
            var typeLabel = { rps: 'Rock Paper Scissors', ttt: 'Tic-Tac-Toe', trivia: 'Trivia', coinflip: 'Coin Flip', reaction: 'Reaction Race', connect4: 'Connect 4', hangman: 'Hangman' };
            self.sendPushToPlayer(msg.targetName, "Battle from " + info.name + "!", (typeLabel[msg.gameType] || msg.gameType) + " for " + wager + " coins", "challenge");
          })();
          return;
        }

        if (msg.type === "acceptChallenge" && msg.challengeId) {
          const self = this;
          (async () => {
            const challenge = self.pendingChallenges.get(msg.challengeId);
            if (!challenge) return;
            if (info.name.toLowerCase() !== challenge.targetName.toLowerCase()) return;
            self.pendingChallenges.delete(msg.challengeId);
            challenge.targetSource = msg.wagerSource === 'wallet' ? 'wallet' : 'score';
            // Deduct wagers based on each player's chosen source
            var d1 = true, d2 = true;
            if (challenge.challengerSource === 'score') d1 = await self.deductWager(challenge.challengerName, challenge.wagerCoins);
            else self.sendToPlayer(challenge.challengerName, { type: "walletDeduct", amount: challenge.wagerCoins });
            if (challenge.targetSource === 'score') d2 = await self.deductWager(challenge.targetName, challenge.wagerCoins);
            else self.sendToPlayer(challenge.targetName, { type: "walletDeduct", amount: challenge.wagerCoins });
            if (!d1 || !d2) {
              if (d1 && challenge.challengerSource === 'score') await self.awardWinnings(challenge.challengerName, challenge.wagerCoins);
              else if (d1) self.sendToPlayer(challenge.challengerName, { type: "walletAward", amount: challenge.wagerCoins });
              if (d2 && challenge.targetSource === 'score') await self.awardWinnings(challenge.targetName, challenge.wagerCoins);
              else if (d2) self.sendToPlayer(challenge.targetName, { type: "walletAward", amount: challenge.wagerCoins });
              self.sendToPlayer(challenge.challengerName, { type: "challengeDeclined", challengeId: msg.challengeId, reason: "insufficient_coins" });
              return;
            }
            const game = self.createGame(challenge);
            const typeNames = { rps: 'Rock Paper Scissors', ttt: 'Tic-Tac-Toe', trivia: 'Trivia', coinflip: 'Coin Flip', reaction: 'Reaction Race', connect4: 'Connect 4', hangman: 'Hangman', battleship: 'Battleship' };
            await self.addSystemChat('\u2694\uFE0F ' + challenge.challengerName + ' vs ' + challenge.targetName + ' \u2014 ' + (typeNames[challenge.gameType] || challenge.gameType) + ' for ' + challenge.wagerCoins + ' coins!');
            // Coin flip: resolve instantly (winner already set in createGame)
            if (challenge.gameType === 'coinflip') {
              self.sendToPlayer(challenge.challengerName, { type: "gameStarted", game: game });
              self.sendToPlayer(challenge.targetName, { type: "gameStarted", game: game });
              setTimeout(async function() { await self.endGame(game, 'completed'); }, 3500);
              return;
            }
            // Reaction race: schedule GO transition + auto-timeout
            if (challenge.gameType === 'reaction') {
              setTimeout(function() {
                if (game.winner) return;
                // Auto-resolve 5s after GO if nobody taps
                setTimeout(async function() {
                  if (game.winner) return;
                  if (!game.reactionP1Tap && !game.reactionP2Tap) game.winner = 'draw';
                  else if (!game.reactionP1Tap) game.winner = game.player2;
                  else if (!game.reactionP2Tap) game.winner = game.player1;
                  await self.endGame(game, 'completed');
                }, 5000);
              }, game.reactionDelay);
            }
            self.sendToPlayer(challenge.challengerName, { type: "gameStarted", game: self.sanitizeGame(game, challenge.challengerName) });
            self.sendToPlayer(challenge.targetName, { type: "gameStarted", game: self.sanitizeGame(game, challenge.targetName) });
          })();
          return;
        }

        if (msg.type === "declineChallenge" && msg.challengeId) {
          const challenge = this.pendingChallenges.get(msg.challengeId);
          if (!challenge) return;
          if (info.name.toLowerCase() !== challenge.targetName.toLowerCase()) return;
          this.pendingChallenges.delete(msg.challengeId);
          this.sendToPlayer(challenge.challengerName, { type: "challengeDeclined", challengeId: msg.challengeId });
          return;
        }

        if (msg.type === "watchGame" && msg.gameId && info.name) {
          const wGame = this.activeGames.get(msg.gameId);
          if (wGame) {
            if (!wGame.spectators) wGame.spectators = [];
            if (!wGame.spectators.includes(info.name)) wGame.spectators.push(info.name);
            this.sendToPlayer(info.name, { type: "spectatorUpdate", game: this.sanitizeGameForSpectator(wGame) });
          }
          return;
        }

        if (msg.type === "spectatorChat" && msg.gameId && info.name && msg.message) {
          const scGame = this.activeGames.get(msg.gameId);
          if (scGame) {
            if (!scGame.spectatorChat) scGame.spectatorChat = [];
            var scMsg = { name: info.name, message: String(msg.message).slice(0, 100), timestamp: Date.now() };
            scGame.spectatorChat.push(scMsg);
            if (scGame.spectatorChat.length > 50) scGame.spectatorChat = scGame.spectatorChat.slice(-50);
            // Broadcast to all spectators + players
            var chatData = { type: "spectatorChatMsg", gameId: msg.gameId, chat: scMsg };
            this.sendToPlayer(scGame.player1, chatData);
            this.sendToPlayer(scGame.player2, chatData);
            for (var si = 0; si < (scGame.spectators || []).length; si++) {
              this.sendToPlayer(scGame.spectators[si], chatData);
            }
          }
          return;
        }

        if (msg.type === "spectatorBet" && msg.gameId && info.name && typeof msg.amount === "number" && msg.betOn) {
          const self = this;
          (async () => {
            const bGame = self.activeGames.get(msg.gameId);
            if (!bGame || bGame.winner) return;
            const betAmount = Math.floor(msg.amount);
            if (betAmount < 100 || betAmount > 1000000) return;
            // Can't bet on your own game
            if (info.name.toLowerCase() === bGame.player1.toLowerCase() || info.name.toLowerCase() === bGame.player2.toLowerCase()) return;
            // Already bet?
            if (!bGame.spectatorBets) bGame.spectatorBets = [];
            if (bGame.spectatorBets.some(function(b) { return b.name.toLowerCase() === info.name.toLowerCase(); })) return;
            // Deduct from score
            const ok = await self.deductWager(info.name, betAmount);
            if (!ok) return;
            bGame.spectatorBets.push({ name: info.name, betOn: msg.betOn, amount: betAmount });
            self.sendToPlayer(info.name, { type: "spectatorBetPlaced", gameId: msg.gameId, betOn: msg.betOn, amount: betAmount });
            // Announce to spectators
            self.broadcastToSpectators(bGame);
          })();
          return;
        }

        if (msg.type === "gameMove" && msg.gameId && info.name) {
          const self = this;
          const game = self.activeGames.get(msg.gameId);
          if (game) { (async () => { await self.processMove(game, info.name, msg.move); })(); }
          return;
        }

        this.connections.set(server, info);
      } catch (e) {
        // plain text heartbeat, ignore
      }
      this.broadcast();
    });

    server.addEventListener("close", () => {
      const closedInfo = this.connections.get(server);
      this.connections.delete(server);
      // Check if disconnected player was in an active game
      if (closedInfo && closedInfo.name) {
        const pName = closedInfo.name;
        const pLower = pName.toLowerCase();
        for (const [gameId, game] of this.activeGames) {
          if (game.winner) continue;
          if (game.player1.toLowerCase() === pLower || game.player2.toLowerCase() === pLower) {
            // Check for other connections from same player
            let hasOther = false;
            for (const [, oi] of this.connections) {
              if (oi.name && oi.name.toLowerCase() === pLower) { hasOther = true; break; }
            }
            if (!hasOther) {
              const opponent = game.player1.toLowerCase() === pLower ? game.player2 : game.player1;
              const self = this;
              const timer = setTimeout(() => {
                if (self.activeGames.has(gameId) && !game.winner) {
                  game.winner = opponent;
                  self.endGame(game, 'forfeit');
                }
                self.forfeitTimers.delete(pLower);
              }, 30000);
              this.forfeitTimers.set(pLower, { timer, gameId });
            }
          }
        }
      }
      this.broadcast();
    });

    server.addEventListener("error", () => {
      this.connections.delete(server);
      this.broadcast();
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  async broadcast() {
    const locations = {};
    const players = [];
    const scoreMap = {};

    // Load persisted scores first
    const persisted = await this.loadScores();
    for (const key of Object.keys(persisted)) {
      scoreMap[key] = { name: persisted[key].name, score: persisted[key].score, stats: persisted[key].stats || { smellyLevel: persisted[key].smellyLevel || "" } };
    }

    // Merge live connections - include ALL users (named and anonymous)
    let anonCounter = 1;
    for (const [, info] of this.connections) {
      const label = info.city ? info.city + ", " + info.country : info.country;
      locations[label] = (locations[label] || 0) + 1;
      const displayName = info.name || ("Anonymous Sniffer #" + anonCounter++);
      players.push({ name: displayName, city: info.city || "", country: info.country, hasName: !!info.name });
      if (info.name) {
        const key = info.name.toLowerCase();
        if (!scoreMap[key] || (info.score || 0) > scoreMap[key].score) {
          scoreMap[key] = { name: info.name, score: info.score || 0, stats: info.stats || {} };
        }
      }
    }

    // Build leaderboard sorted by score
    const leaderboard = Object.values(scoreMap)
      .filter((e) => e.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 50);

    // Get active sabotages (prunes expired ones)
    const activeSabotages = await this.loadSabotages();

    // Load credits
    const credits = await this.loadCredits();

    // Load active campaigns
    const allCampaigns = await this.loadCampaigns();
    const now2 = Date.now();
    const activeCampaigns = [];
    for (const key of Object.keys(allCampaigns)) {
      const c = allCampaigns[key];
      if (c.status === "active") {
        activeCampaigns.push(c);
      } else if (c.status === "completed" && c.completedAt && (now2 - c.completedAt) < 5 * 60 * 1000) {
        activeCampaigns.push(c);
      }
    }

    // Load equipped skins
    const skinData = await this.loadSkinData();
    const equippedSkins = skinData.equipped || {};

    // Detect podium (top-3) changes
    const currentPodium = leaderboard.slice(0, 3).map(e => e.name);
    const prevPodium = this.lastPodium || [];
    const podiumChanges = [];
    for (let i = 0; i < 3; i++) {
      const newPlayer = currentPodium[i] || null;
      const oldPlayer = prevPodium[i] || null;
      if (newPlayer !== oldPlayer) {
        const wasOnPodium = newPlayer && prevPodium.includes(newPlayer);
        podiumChanges.push({
          position: i + 1,
          newPlayer: newPlayer,
          oldPlayer: oldPlayer,
          type: !oldPlayer ? 'new_entry' : (!wasOnPodium ? 'takeover' : 'swap')
        });
      }
    }
    // Fire system chat for podium changes
    if (podiumChanges.length > 0 && prevPodium.length > 0) {
      for (const change of podiumChanges) {
        if (!change.newPlayer) continue;
        if (change.position === 1 && change.oldPlayer) {
          await this.addSystemChat("\uD83D\uDC51 DETHRONED! " + change.newPlayer + " knocked " + change.oldPlayer + " off the throne!");
        } else if (change.position === 2 && change.oldPlayer) {
          await this.addSystemChat("\uD83E\uDD48 " + change.newPlayer + " snatched #2 from " + change.oldPlayer + "!");
        } else if (change.position === 3 && change.oldPlayer) {
          await this.addSystemChat("\uD83E\uDD49 " + change.newPlayer + " muscled onto the podium, booting " + change.oldPlayer + "!");
        } else if (!change.oldPlayer || change.type === 'new_entry') {
          await this.addSystemChat("\uD83C\uDF89 " + change.newPlayer + " enters the podium for the first time at #" + change.position + "!");
        }
      }
    }
    this.lastPodium = currentPodium;

    const currentEpoch = await this.loadScoreEpoch();

    const data = JSON.stringify({
      count: this.connections.size,
      locations: locations,
      players: players,
      leaderboard: leaderboard,
      sabotages: activeSabotages,
      credits: credits,
      campaigns: activeCampaigns,
      equippedSkins: equippedSkins,
      lukeHidden: await this.loadLukeHidden(),
      activeGames: Array.from(this.activeGames.values()).filter(function(g) { return !g.winner; }).map(function(g) {
        return { id: g.id, type: g.type, player1: g.player1, player2: g.player2, wagerCoins: g.wagerCoins, spectatorCount: (g.spectators || []).length, betPool: (g.spectatorBets || []).reduce(function(s,b) { return s+b.amount; }, 0) };
      }),
      podiumChanges: podiumChanges.length > 0 ? podiumChanges : undefined,
      scoreEpoch: currentEpoch,
    });

    for (const [ws] of this.connections) {
      try {
        ws.send(data);
      } catch (e) {
        this.connections.delete(ws);
      }
    }
  }
}

// ===== TRIVIA BANK =====
const TRIVIA_BANK = [
  {q:"How many hearts does an octopus have?",a:["Three","Two","Five","One"],c:0},
  {q:"What is a group of flamingos called?",a:["A flamboyance","A flock","A bloom","A colony"],c:0},
  {q:"Which animal can sleep for 3 years?",a:["Snail","Sloth","Koala","Cat"],c:0},
  {q:"What animal has the longest pregnancy?",a:["Elephant","Blue whale","Giraffe","Rhino"],c:0},
  {q:"How many noses does a slug have?",a:["Four","Two","One","Three"],c:0},
  {q:"What is the only mammal that can truly fly?",a:["Bat","Flying squirrel","Sugar glider","Colugo"],c:0},
  {q:"Which bird can fly backwards?",a:["Hummingbird","Kingfisher","Swift","Sparrow"],c:0},
  {q:"What color is a hippo's sweat?",a:["Red","Clear","Yellow","Brown"],c:0},
  {q:"How many brains does a leech have?",a:["32","2","1","10"],c:0},
  {q:"What animal has the largest eye?",a:["Colossal squid","Blue whale","Ostrich","Horse"],c:0},
  {q:"What country has the most islands?",a:["Sweden","Indonesia","Philippines","Canada"],c:0},
  {q:"What is the driest continent on Earth?",a:["Antarctica","Africa","Australia","Asia"],c:0},
  {q:"What is the smallest country in the world?",a:["Vatican City","Monaco","Nauru","San Marino"],c:0},
  {q:"What country has more pyramids than Egypt?",a:["Sudan","Mexico","Peru","Iraq"],c:0},
  {q:"What capital city is the highest above sea level?",a:["La Paz","Quito","Bogota","Addis Ababa"],c:0},
  {q:"What is the only continent with no active volcanoes?",a:["Australia","Antarctica","Europe","Africa"],c:0},
  {q:"What country has a flag that is not rectangular?",a:["Nepal","Switzerland","Tonga","Bhutan"],c:0},
  {q:"What ocean is the Bermuda Triangle in?",a:["Atlantic","Pacific","Indian","Arctic"],c:0},
  {q:"What was the shortest war in history?",a:["Anglo-Zanzibar War","Six-Day War","Falklands War","Gulf War"],c:0},
  {q:"Who was the first woman to win a Nobel Prize?",a:["Marie Curie","Mother Teresa","Dorothy Hodgkin","Bertha von Suttner"],c:0},
  {q:"What ancient wonder was in Alexandria?",a:["Lighthouse","Library","Colossus","Hanging Gardens"],c:0},
  {q:"How long did the Hundred Years' War last?",a:["116 years","100 years","99 years","120 years"],c:0},
  {q:"What was invented first: lighter or match?",a:["Lighter","Match","Same year","Neither"],c:0},
  {q:"Who painted the ceiling of the Sistine Chapel?",a:["Michelangelo","Leonardo da Vinci","Raphael","Donatello"],c:0},
  {q:"What year did the Titanic sink?",a:["1912","1905","1915","1920"],c:0},
  {q:"Which ancient civilization invented paper?",a:["Chinese","Egyptian","Roman","Greek"],c:0},
  {q:"What was the first toy advertised on TV?",a:["Mr. Potato Head","Barbie","Slinky","Etch A Sketch"],c:0},
  {q:"What is the hardest natural substance?",a:["Diamond","Titanium","Quartz","Sapphire"],c:0},
  {q:"How many bones does a shark have?",a:["Zero","206","100","50"],c:0},
  {q:"What planet rains diamonds?",a:["Neptune","Jupiter","Saturn","Venus"],c:0},
  {q:"What percentage of the ocean is unexplored?",a:["Over 80%","About 50%","About 30%","Over 95%"],c:0},
  {q:"How long is one day on Venus?",a:["243 Earth days","365 Earth days","30 Earth days","1 Earth day"],c:0},
  {q:"What is the most abundant gas in Earth's atmosphere?",a:["Nitrogen","Oxygen","Carbon dioxide","Argon"],c:0},
  {q:"What temperature are Celsius and Fahrenheit equal?",a:["-40","0","-32","32"],c:0},
  {q:"What color does gold turn when nano-sized?",a:["Red","Blue","Green","Purple"],c:0},
  {q:"What nut is used to make marzipan?",a:["Almond","Walnut","Cashew","Pistachio"],c:0},
  {q:"What is the most stolen food in the world?",a:["Cheese","Chocolate","Meat","Bread"],c:0},
  {q:"What fruit floats in water?",a:["Apple","Grape","Banana","Mango"],c:0},
  {q:"What spice is the most expensive by weight?",a:["Saffron","Vanilla","Cardamom","Cinnamon"],c:0},
  {q:"What food never spoils?",a:["Honey","Rice","Salt","Sugar"],c:0},
  {q:"What country invented ice cream?",a:["China","Italy","France","Turkey"],c:0},
  {q:"What vegetable was first grown in space?",a:["Potato","Lettuce","Tomato","Carrot"],c:0},
  {q:"What is the fear of long words called?",a:["Hippopotomonstrosesquippedaliophobia","Logophobia","Verbophobia","Sesquiphobia"],c:0},
  {q:"How many dimples does a golf ball have?",a:["336","200","400","500"],c:0},
  {q:"What is the dot over the letter 'i' called?",a:["Tittle","Dot","Iota","Serif"],c:0},
  {q:"How long is the longest hiccuping spree?",a:["68 years","10 years","30 years","1 year"],c:0},
  {q:"What is the national animal of Scotland?",a:["Unicorn","Lion","Stag","Eagle"],c:0},
  {q:"What was the first message sent over the internet?",a:["LO","Hello","Test","Hi"],c:0},
  {q:"How many muscles does a cat have in each ear?",a:["32","12","8","20"],c:0},
  {q:"What is the only letter not in any US state name?",a:["Q","X","Z","J"],c:0},
  {q:"How long does sunlight take to reach Earth?",a:["8 minutes","1 second","1 minute","30 minutes"],c:0},
  {q:"What planet has the most moons?",a:["Saturn","Jupiter","Uranus","Neptune"],c:0},
  {q:"What is the hottest planet in our solar system?",a:["Venus","Mercury","Mars","Jupiter"],c:0},
  {q:"How old is the universe?",a:["13.8 billion years","10 billion years","4.5 billion years","20 billion years"],c:0},
  {q:"What planet spins on its side?",a:["Uranus","Neptune","Pluto","Saturn"],c:0},
  {q:"How many bones does an adult human have?",a:["206","300","180","250"],c:0},
  {q:"What is the smallest bone in the body?",a:["Stapes","Hammer","Anvil","Phalanx"],c:0},
  {q:"What organ uses 20% of your oxygen?",a:["Brain","Heart","Liver","Lungs"],c:0},
  {q:"How many times does the heart beat per day?",a:["100,000","50,000","200,000","75,000"],c:0},
  {q:"What is the most spoken language in the world?",a:["Mandarin","English","Spanish","Hindi"],c:0},
  {q:"What is the longest English word with no vowels?",a:["Rhythms","Myths","Gym","Lynx"],c:0},
  {q:"How many official languages does South Africa have?",a:["11","2","5","8"],c:0},
  {q:"What is the oldest known written language?",a:["Sumerian","Egyptian","Chinese","Sanskrit"],c:0},
  {q:"How long is an Olympic swimming pool?",a:["50 meters","100 meters","25 meters","75 meters"],c:0},
  {q:"What sport was first played on the moon?",a:["Golf","Tennis","Baseball","Frisbee"],c:0},
  {q:"What country invented chess?",a:["India","China","Persia","Egypt"],c:0},
  {q:"How wide is an NBA basketball hoop in inches?",a:["18","16","20","24"],c:0},
  {q:"What instrument has 47 strings?",a:["Harp","Piano","Guitar","Sitar"],c:0},
  {q:"How many keys does a standard piano have?",a:["88","76","92","64"],c:0},
  {q:"What note is a standard tuning fork?",a:["A","C","E","G"],c:0},
  {q:"What year was the first iPhone released?",a:["2007","2005","2008","2006"],c:0},
  {q:"What was the first computer virus called?",a:["Creeper","Worm","Bug","Trojan"],c:0},
  {q:"How many bits in a byte?",a:["8","4","16","2"],c:0},
  {q:"What company created the first hard drive?",a:["IBM","Apple","Microsoft","Intel"],c:0},
  {q:"What is the only even prime number?",a:["2","4","0","6"],c:0},
  {q:"What is a googol?",a:["10^100","10^10","10^1000","10^50"],c:0},
  {q:"What number is considered unlucky in Japan?",a:["4","13","7","9"],c:0},
  {q:"What is the Mona Lisa's real name?",a:["La Gioconda","La Bella","La Donna","La Signora"],c:0},
  {q:"What artist cut off his own ear?",a:["Van Gogh","Picasso","Monet","Dali"],c:0},
  {q:"What color do you get mixing all colors of light?",a:["White","Black","Brown","Gray"],c:0},
  {q:"What is the most visited museum in the world?",a:["Louvre","British Museum","Met","Smithsonian"],c:0},
  {q:"How many Rubik's Cube combinations are there?",a:["43 quintillion","1 billion","1 million","1 trillion"],c:0},
  {q:"What is the speed of light in km/s?",a:["300,000","150,000","1,000,000","30,000"],c:0},
  {q:"What element has the chemical symbol 'Au'?",a:["Gold","Silver","Aluminum","Argon"],c:0},
  {q:"Which planet has the Great Red Spot?",a:["Jupiter","Mars","Saturn","Neptune"],c:0},
  {q:"What blood type is the universal donor?",a:["O negative","AB positive","A positive","B negative"],c:0},
  {q:"How many teeth does an adult human have?",a:["32","28","36","30"],c:0},
  {q:"What is the largest organ in the human body?",a:["Skin","Liver","Brain","Lungs"],c:0},
  {q:"What is the rarest blood type?",a:["AB negative","O negative","B negative","A negative"],c:0},
  {q:"How many time zones does Russia span?",a:["11","9","7","13"],c:0},
  {q:"What is the deepest point in the ocean?",a:["Mariana Trench","Tonga Trench","Java Trench","Puerto Rico Trench"],c:0},
  {q:"How many cards are in a standard deck?",a:["52","48","54","56"],c:0},
  {q:"What is the only letter that doesn't appear in the periodic table?",a:["J","Q","X","Z"],c:0},
  {q:"How many rings are on the Olympic flag?",a:["5","4","6","7"],c:0},
  {q:"What is the longest bone in the human body?",a:["Femur","Tibia","Humerus","Spine"],c:0},
  {q:"What gas makes soda fizzy?",a:["Carbon dioxide","Nitrogen","Oxygen","Helium"],c:0},
  {q:"What is the only metal that is liquid at room temperature?",a:["Mercury","Gallium","Cesium","Lead"],c:0},
  {q:"How many sides does a dodecagon have?",a:["12","10","8","14"],c:0},
  {q:"What country gifted the Statue of Liberty to the US?",a:["France","England","Germany","Spain"],c:0},
  {q:"What is the largest desert in the world?",a:["Antarctica","Sahara","Arabian","Gobi"],c:0},
];

// ===== HANGMAN WORD BANK =====
const HANGMAN_WORDS = [
  'PIANO','GLOBE','BEACH','FLAME','OCEAN','TIGER','CLOUD','DREAM','MAGIC','DANCE',
  'STORM','LIGHT','MUSIC','RIVER','GHOST','STONE','QUEEN','TRAIN','SMILE','WORLD',
  'BRAIN','CANDY','FAIRY','GRAPE','HONEY','LEMON','MELON','NINJA','OLIVE','PEARL',
  'ROBOT','SNAKE','TOWER','VENUS','WHALE','YACHT','ZEBRA','ANGEL','BLOOM','CROWN',
  'CRYSTAL','DOLPHIN','ECLIPSE','FIREFLY','GALAXY','HARMONY','ICEBERG','JOURNEY',
  'KINGDOM','LANTERN','MYSTERY','NEPTUNE','COMPASS','PENGUIN','RAINBOW','SHELTER',
  'THUNDER','VOLCANO','WARRIOR','PHANTOM','DIAMOND','EMERALD','FORTUNE','GIRAFFE',
  'HORIZON','IMAGINE','JUSTICE','KNIGHTS','LIBRARY','MONSTER','NOTHING','OUTSIDE',
  'PANTHER','QUANTUM','SILICON','TROUBLE','UNICORN','VILLAIN','WHISPER','BLANKET',
  'CAPTAIN','ELEGANT','FEATHER','GENUINE','HABITAT','INSIGHT','JUKEBOX','LOYALTY',
  'MIRACLE','DESTINY','PARADOX','SAPPHIRE','TROPICAL','MIDNIGHT','CHAMPION','ASTEROID',
];

// Durable Object for leaderboard persistence
export class Leaderboard {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "GET") {
      // Return top 20 scores
      const scores = (await this.state.storage.get("scores")) || [];
      return new Response(JSON.stringify(scores), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (request.method === "POST") {
      const body = await request.json();
      const name = (body.name || "Anonymous").slice(0, 20);
      const score = Math.floor(Number(body.score) || 0);
      if (score <= 0) {
        return new Response(JSON.stringify({ error: "Invalid score" }), { status: 400 });
      }

      let scores = (await this.state.storage.get("scores")) || [];

      // Check if this name already exists - update if higher score
      const existing = scores.findIndex(
        (s) => s.name.toLowerCase() === name.toLowerCase()
      );
      if (existing >= 0) {
        if (score > scores[existing].score) {
          scores[existing].score = score;
          scores[existing].date = Date.now();
        }
      } else {
        scores.push({ name, score, date: Date.now() });
      }

      // Sort descending, keep top 50
      scores.sort((a, b) => b.score - a.score);
      scores = scores.slice(0, 50);

      await this.state.storage.put("scores", scores);

      return new Response(JSON.stringify({ ok: true, rank: scores.findIndex((s) => s.name.toLowerCase() === name.toLowerCase()) + 1 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Method not allowed", { status: 405 });
  }
}

// In-memory cache for total raised endpoint (30-second TTL)
let totalRaisedCache = null;

async function fetchAndBroadcastRaised(env) {
  try {
    totalRaisedCache = null; // invalidate
    let totalNetCents = 0;
    let transactionCount = 0;
    let hasMore = true;
    let startingAfter = null;
    while (hasMore) {
      const params = new URLSearchParams({ limit: "100" });
      if (startingAfter) params.set("starting_after", startingAfter);
      const stripeRes = await fetch(
        "https://api.stripe.com/v1/balance_transactions?" + params.toString(),
        { headers: { Authorization: "Basic " + btoa(env.STRIPE_SECRET_KEY + ":") } }
      );
      const result = await stripeRes.json();
      if (!result.data || result.data.length === 0) break;
      for (let i = 0; i < result.data.length; i++) {
        const bt = result.data[i];
        if ((bt.type === "charge" || bt.type === "payment") && bt.net > 0) {
          totalNetCents += bt.net;
          transactionCount++;
        }
      }
      hasMore = result.has_more === true;
      if (hasMore) startingAfter = result.data[result.data.length - 1].id;
    }
    const data = { totalRaisedCents: totalNetCents, transactionCount: transactionCount };
    totalRaisedCache = { data: data, timestamp: Date.now() };
    // Broadcast to all connected clients
    const id = env.LIVE_VISITORS.idFromName("global");
    const obj = env.LIVE_VISITORS.get(id);
    await obj.fetch(new Request("https://dummy/broadcast-raised", {
      method: "POST",
      body: JSON.stringify(data),
    }));
  } catch (e) {
    // silent fail
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Constant-time string comparison to prevent timing attacks
function safeCompare(a, b) {
  if (a.length !== b.length) {
    // Still do a dummy comparison to avoid leaking length info via timing
    let result = 1;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ a.charCodeAt(i);
    }
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifyAdmin(request, env) {
  const authHeader = request.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return false;
  const token = authHeader.slice(7);
  if (!env.ADMIN_PASSWORD) return false;
  const tokenHash = await hashPassword(token);
  const expectedHash = await hashPassword(env.ADMIN_PASSWORD);
  return safeCompare(tokenHash, expectedHash);
}

function corsResponse(body, init = {}) {
  const headers = { ...corsHeaders, ...(init.headers || {}) };
  return new Response(body, { ...init, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return corsResponse(null, { status: 204 });
    }

    // WebSocket for live visitors
    if (url.pathname === "/ws") {
      const id = env.LIVE_VISITORS.idFromName("global");
      const obj = env.LIVE_VISITORS.get(id);
      return obj.fetch(request);
    }

    // Leaderboard
    if (url.pathname === "/leaderboard") {
      const id = env.LEADERBOARD.idFromName("global");
      const obj = env.LEADERBOARD.get(id);
      const res = await obj.fetch(request);
      const body = await res.text();
      return corsResponse(body, {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    // One-time migration: copy old Leaderboard DO data into LiveVisitors DO
    if (url.pathname === "/migrate-leaderboard") {
      // Read from old Leaderboard DO
      const lbId = env.LEADERBOARD.idFromName("global");
      const lbObj = env.LEADERBOARD.get(lbId);
      const lbRes = await lbObj.fetch(new Request("https://dummy/", { method: "GET" }));
      const oldScores = await lbRes.json();

      // Write into LiveVisitors DO storage
      const lvId = env.LIVE_VISITORS.idFromName("global");
      const lvObj = env.LIVE_VISITORS.get(lvId);

      // Send each score as a scoreUpdate message via a POST
      for (const entry of oldScores) {
        await lvObj.fetch(new Request("https://dummy/import-score", {
          method: "POST",
          body: JSON.stringify({ name: entry.name, score: entry.score }),
        }));
      }

      return corsResponse(JSON.stringify({ migrated: oldScores.length }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Stripe: Create Payment Intent for "Hide Luke"
    if (url.pathname === "/create-payment-intent" && request.method === "POST") {
      try {
        const stripeRes = await fetch(
          "https://api.stripe.com/v1/payment_intents",
          {
            method: "POST",
            headers: {
              Authorization: "Basic " + btoa(env.STRIPE_SECRET_KEY + ":"),
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              amount: "199",
              currency: "usd",
              "automatic_payment_methods[enabled]": "true",
              description: "Hide Luke for 1 Hour - Jared Clicker",
            }).toString(),
          }
        );

        const intent = await stripeRes.json();

        if (intent.error) {
          return corsResponse(JSON.stringify({ error: intent.error.message }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        return corsResponse(
          JSON.stringify({ clientSecret: intent.client_secret }),
          { headers: { "Content-Type": "application/json" } }
        );
      } catch (e) {
        return corsResponse(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Stripe: Create Payment Intent for Coin Packs
    if (url.pathname === "/create-coinpack-intent" && request.method === "POST") {
      try {
        const body = await request.json();
        const packId = String(body.packId || "");
        const playerName = String(body.playerName || "").slice(0, 20);
        const coins = Math.floor(Number(body.coins) || 0);
        const packPrices = { starter: 199, grinder: 499, baller: 999, whale: 1999 };
        const packLabels = { starter: "Starter Pack", grinder: "Grinder Pack", baller: "Baller Pack", whale: "Whale Pack" };
        const priceCents = packPrices[packId];
        if (!priceCents || !playerName || coins <= 0) {
          return corsResponse(JSON.stringify({ error: "Valid packId, playerName, and coins required" }), {
            status: 400, headers: { "Content-Type": "application/json" },
          });
        }
        const label = packLabels[packId] + " (" + coins.toLocaleString() + " coins)";
        const stripeRes = await fetch("https://api.stripe.com/v1/payment_intents", {
          method: "POST",
          headers: {
            Authorization: "Basic " + btoa(env.STRIPE_SECRET_KEY + ":"),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            amount: String(priceCents), currency: "usd",
            "automatic_payment_methods[enabled]": "true",
            description: label + " for " + playerName + " - Jared Clicker",
            "metadata[playerName]": playerName, "metadata[type]": "coinpack", "metadata[packId]": packId, "metadata[coins]": String(coins),
          }).toString(),
        });
        const intent = await stripeRes.json();
        if (intent.error) {
          return corsResponse(JSON.stringify({ error: intent.error.message }), {
            status: 400, headers: { "Content-Type": "application/json" },
          });
        }
        return corsResponse(JSON.stringify({ clientSecret: intent.client_secret, coins: pack.coins }), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (e) {
        return corsResponse(JSON.stringify({ error: e.message }), {
          status: 500, headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Redeem coin pack (called after payment succeeds)
    if (url.pathname === "/redeem-coinpack" && request.method === "POST") {
      try {
        const body = await request.json();
        const playerName = String(body.playerName || "").slice(0, 20);
        const coins = Math.floor(Number(body.coins) || 0);
        if (!playerName || coins <= 0) {
          return corsResponse(JSON.stringify({ error: "playerName and coins required" }), {
            status: 400, headers: { "Content-Type": "application/json" },
          });
        }
        const id = env.LIVE_VISITORS.idFromName("global");
        const obj = env.LIVE_VISITORS.get(id);
        const res = await obj.fetch(new Request("https://dummy/admin/add-coins", {
          method: "POST",
          body: JSON.stringify({ playerName, amount: coins }),
        }));
        const result = await res.text();
        return corsResponse(result, {
          status: res.status, headers: { "Content-Type": "application/json" },
        });
      } catch (e) {
        return corsResponse(JSON.stringify({ error: e.message }), {
          status: 500, headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Stripe: Create Payment Intent for Sabotage ($0.99)
    if (url.pathname === "/create-sabotage-intent" && request.method === "POST") {
      try {
        const body = await request.json();
        const targetName = String(body.targetName || "").slice(0, 20);
        if (!targetName) {
          return corsResponse(JSON.stringify({ error: "targetName required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const stripeRes = await fetch(
          "https://api.stripe.com/v1/payment_intents",
          {
            method: "POST",
            headers: {
              Authorization: "Basic " + btoa(env.STRIPE_SECRET_KEY + ":"),
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              amount: "99",
              currency: "usd",
              "automatic_payment_methods[enabled]": "true",
              description: "Sabotage " + targetName + " - Jared Clicker",
              "metadata[targetName]": targetName,
              "metadata[type]": "sabotage",
            }).toString(),
          }
        );

        const intent = await stripeRes.json();

        if (intent.error) {
          return corsResponse(JSON.stringify({ error: intent.error.message }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        return corsResponse(
          JSON.stringify({ clientSecret: intent.client_secret }),
          { headers: { "Content-Type": "application/json" } }
        );
      } catch (e) {
        return corsResponse(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Stripe: Create Payment Intent for Sabotage Credits ($4.99 for 5)
    if (url.pathname === "/create-credits-intent" && request.method === "POST") {
      try {
        const stripeRes = await fetch(
          "https://api.stripe.com/v1/payment_intents",
          {
            method: "POST",
            headers: {
              Authorization: "Basic " + btoa(env.STRIPE_SECRET_KEY + ":"),
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              amount: "399",
              currency: "usd",
              "automatic_payment_methods[enabled]": "true",
              description: "5 Sabotage Credits - Jared Clicker",
              "metadata[type]": "credits",
            }).toString(),
          }
        );

        const intent = await stripeRes.json();

        if (intent.error) {
          return corsResponse(JSON.stringify({ error: intent.error.message }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        return corsResponse(
          JSON.stringify({ clientSecret: intent.client_secret }),
          { headers: { "Content-Type": "application/json" } }
        );
      } catch (e) {
        return corsResponse(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Stripe: Create Payment Intent for Single Sabotage ($0.99)
    if (url.pathname === "/create-single-sabotage-intent" && request.method === "POST") {
      try {
        const body = await request.json();
        const targetName = String(body.targetName || "").slice(0, 20);
        if (!targetName) {
          return corsResponse(JSON.stringify({ error: "targetName required" }), {
            status: 400, headers: { "Content-Type": "application/json" },
          });
        }
        const stripeRes = await fetch("https://api.stripe.com/v1/payment_intents", {
          method: "POST",
          headers: {
            Authorization: "Basic " + btoa(env.STRIPE_SECRET_KEY + ":"),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            amount: "99", currency: "usd",
            "automatic_payment_methods[enabled]": "true",
            description: "Single sabotage on " + targetName + " - Jared Clicker",
            "metadata[targetName]": targetName, "metadata[type]": "single-sabotage",
          }).toString(),
        });
        const intent = await stripeRes.json();
        if (intent.error) {
          return corsResponse(JSON.stringify({ error: intent.error.message }), {
            status: 400, headers: { "Content-Type": "application/json" },
          });
        }
        return corsResponse(JSON.stringify({ clientSecret: intent.client_secret }), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (e) {
        return corsResponse(JSON.stringify({ error: e.message }), {
          status: 500, headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Stripe: Create Payment Intent for Coin Cut (dynamic pricing)
    if (url.pathname === "/create-coincut-intent" && request.method === "POST") {
      try {
        const body = await request.json();
        const targetName = String(body.targetName || "").slice(0, 20);
        const percentage = Math.floor(Number(body.percentage) || 0);
        const targetScore = Math.floor(Number(body.targetScore) || 0);
        const allowedPcts = [1,5,10,15,20,25,30,35,40];
        if (!targetName || allowedPcts.indexOf(percentage) < 0) {
          return corsResponse(JSON.stringify({ error: "Invalid parameters" }), {
            status: 400, headers: { "Content-Type": "application/json" },
          });
        }
        const dollars = Math.max(Math.ceil(percentage / 10), Math.min(50, Math.floor(Math.log10(Math.max(targetScore, 10)) * (percentage / 100) * 3.5)));
        const priceCents = dollars * 100;
        const stripeRes = await fetch("https://api.stripe.com/v1/payment_intents", {
          method: "POST",
          headers: {
            Authorization: "Basic " + btoa(env.STRIPE_SECRET_KEY + ":"),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            amount: String(priceCents), currency: "usd",
            "automatic_payment_methods[enabled]": "true",
            description: "Coin Cut " + percentage + "% on " + targetName + " - Jared Clicker",
            "metadata[targetName]": targetName, "metadata[type]": "coincut", "metadata[percentage]": String(percentage),
          }).toString(),
        });
        const intent = await stripeRes.json();
        if (intent.error) {
          return corsResponse(JSON.stringify({ error: intent.error.message }), {
            status: 400, headers: { "Content-Type": "application/json" },
          });
        }
        return corsResponse(JSON.stringify({ clientSecret: intent.client_secret, priceCents }), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (e) {
        return corsResponse(JSON.stringify({ error: e.message }), {
          status: 500, headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Apply coin cut: reduce target's score by percentage
    if (url.pathname === "/coincut" && request.method === "POST") {
      try {
        const body = await request.json();
        const attackerName = String(body.attackerName || "").slice(0, 20);
        const targetName = String(body.targetName || "").slice(0, 20);
        const percentage = Math.floor(Number(body.percentage) || 0);
        const allowedPcts = [1,5,10,15,20,25,30,35,40];
        if (!attackerName || !targetName || allowedPcts.indexOf(percentage) < 0) {
          return corsResponse(JSON.stringify({ error: "Invalid parameters" }), {
            status: 400, headers: { "Content-Type": "application/json" },
          });
        }
        const id = env.LIVE_VISITORS.idFromName("global");
        const obj = env.LIVE_VISITORS.get(id);
        const res = await obj.fetch(new Request("https://dummy/coincut", {
          method: "POST",
          body: JSON.stringify({ attackerName, targetName, percentage }),
        }));
        const result = await res.text();
        return corsResponse(result, {
          status: res.status, headers: { "Content-Type": "application/json" },
        });
      } catch (e) {
        return corsResponse(JSON.stringify({ error: e.message }), {
          status: 500, headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Account endpoints — proxy to LiveVisitors DO
    if (url.pathname.startsWith("/account/") && (request.method === "POST" || request.method === "GET")) {
      try {
        const id = env.LIVE_VISITORS.idFromName("global");
        const obj = env.LIVE_VISITORS.get(id);
        const body = request.method === "POST" ? await request.text() : undefined;
        const res = await obj.fetch(new Request("https://dummy" + url.pathname, {
          method: request.method,
          body: body,
          headers: { "Content-Type": "application/json" },
        }));
        const result = await res.text();
        return corsResponse(result, { status: res.status, headers: { "Content-Type": "application/json" } });
      } catch (e) {
        return corsResponse(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
    }

    // Create a pooled coin cut campaign
    // Create a TOTAL WIPE campaign
    if (url.pathname === "/create-wipe-campaign" && request.method === "POST") {
      try {
        const body = await request.json();
        const attackerName = String(body.attackerName || "").slice(0, 20);
        const targetName = String(body.targetName || "").slice(0, 20);
        if (!attackerName || !targetName) {
          return corsResponse(JSON.stringify({ error: "Invalid parameters" }), {
            status: 400, headers: { "Content-Type": "application/json" },
          });
        }
        const id = env.LIVE_VISITORS.idFromName("global");
        const obj = env.LIVE_VISITORS.get(id);
        const res = await obj.fetch(new Request("https://dummy/campaign/create-wipe", {
          method: "POST",
          body: JSON.stringify({ attackerName, targetName }),
        }));
        const result = await res.text();
        return corsResponse(result, {
          status: res.status, headers: { "Content-Type": "application/json" },
        });
      } catch (e) {
        return corsResponse(JSON.stringify({ error: e.message }), {
          status: 500, headers: { "Content-Type": "application/json" },
        });
      }
    }

    if (url.pathname === "/create-campaign" && request.method === "POST") {
      try {
        const body = await request.json();
        const attackerName = String(body.attackerName || "").slice(0, 20);
        const targetName = String(body.targetName || "").slice(0, 20);
        const percentage = Math.floor(Number(body.percentage) || 0);
        const targetScore = Math.floor(Number(body.targetScore) || 0);
        const allowedPcts = [1,5,10,15,20,25,30,35,40];
        if (!attackerName || !targetName || allowedPcts.indexOf(percentage) < 0) {
          return corsResponse(JSON.stringify({ error: "Invalid parameters" }), {
            status: 400, headers: { "Content-Type": "application/json" },
          });
        }
        const id = env.LIVE_VISITORS.idFromName("global");
        const obj = env.LIVE_VISITORS.get(id);
        const res = await obj.fetch(new Request("https://dummy/campaign/create", {
          method: "POST",
          body: JSON.stringify({ attackerName, targetName, percentage, targetScore }),
        }));
        const result = await res.text();
        return corsResponse(result, {
          status: res.status, headers: { "Content-Type": "application/json" },
        });
      } catch (e) {
        return corsResponse(JSON.stringify({ error: e.message }), {
          status: 500, headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Create Stripe PaymentIntent for campaign contribution
    // Cancel a campaign
    if (url.pathname === "/cancel-campaign" && request.method === "POST") {
      try {
        const body = await request.json();
        const id = env.LIVE_VISITORS.idFromName("global");
        const obj = env.LIVE_VISITORS.get(id);
        const res = await obj.fetch(new Request("https://dummy/campaign/cancel", {
          method: "POST",
          body: JSON.stringify(body),
        }));
        const result = await res.text();
        return corsResponse(result, {
          status: res.status, headers: { "Content-Type": "application/json" },
        });
      } catch (e) {
        return corsResponse(JSON.stringify({ error: e.message }), {
          status: 500, headers: { "Content-Type": "application/json" },
        });
      }
    }

    if (url.pathname === "/create-campaign-contribution-intent" && request.method === "POST") {
      try {
        const body = await request.json();
        const campaignId = String(body.campaignId || "");
        const amount = Math.floor(Number(body.amount) || 0);
        if (!campaignId || amount < 1) {
          return corsResponse(JSON.stringify({ error: "campaignId and amount (min $1) required" }), {
            status: 400, headers: { "Content-Type": "application/json" },
          });
        }
        const maxAmount = Math.floor(Number(body.maxAmount) || 50);
        const cappedAmount = Math.min(amount, maxAmount);
        const contributionCents = cappedAmount * 100;
        const premiumCents = body.loot ? contributionCents : 0;
        const totalChargeCents = contributionCents + premiumCents;
        const desc = premiumCents > 0
          ? "Campaign $" + cappedAmount + " + $" + cappedAmount + " loot premium - Jared Clicker"
          : "Campaign contribution $" + cappedAmount + " - Jared Clicker";
        const stripeRes = await fetch("https://api.stripe.com/v1/payment_intents", {
          method: "POST",
          headers: {
            Authorization: "Basic " + btoa(env.STRIPE_SECRET_KEY + ":"),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            amount: String(totalChargeCents), currency: "usd",
            "automatic_payment_methods[enabled]": "true",
            description: desc,
            "metadata[campaignId]": campaignId, "metadata[type]": "campaign-contribution",
          }).toString(),
        });
        const intent = await stripeRes.json();
        if (intent.error) {
          return corsResponse(JSON.stringify({ error: intent.error.message }), {
            status: 400, headers: { "Content-Type": "application/json" },
          });
        }
        return corsResponse(JSON.stringify({ clientSecret: intent.client_secret, priceCents: contributionCents, premiumCents: premiumCents, totalChargeCents: totalChargeCents }), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (e) {
        return corsResponse(JSON.stringify({ error: e.message }), {
          status: 500, headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Apply campaign contribution after payment
    if (url.pathname === "/campaign-contribute" && request.method === "POST") {
      try {
        const body = await request.json();
        const campaignId = String(body.campaignId || "");
        const contributorName = String(body.contributorName || "").slice(0, 20);
        const cents = Math.floor(Number(body.cents) || 0);
        const premiumCents = Math.floor(Number(body.premiumCents) || 0);
        if (!campaignId || !contributorName || cents <= 0) {
          return corsResponse(JSON.stringify({ error: "Invalid parameters" }), {
            status: 400, headers: { "Content-Type": "application/json" },
          });
        }
        const id = env.LIVE_VISITORS.idFromName("global");
        const obj = env.LIVE_VISITORS.get(id);
        const res = await obj.fetch(new Request("https://dummy/campaign/contribute", {
          method: "POST",
          body: JSON.stringify({ campaignId, contributorName, cents, premiumCents }),
        }));
        const result = await res.text();
        return corsResponse(result, {
          status: res.status, headers: { "Content-Type": "application/json" },
        });
      } catch (e) {
        return corsResponse(JSON.stringify({ error: e.message }), {
          status: 500, headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Get active campaigns
    if (url.pathname === "/campaigns" && request.method === "GET") {
      try {
        const id = env.LIVE_VISITORS.idFromName("global");
        const obj = env.LIVE_VISITORS.get(id);
        const res = await obj.fetch(new Request("https://dummy/campaigns", { method: "GET" }));
        const result = await res.text();
        return corsResponse(result, {
          status: res.status, headers: { "Content-Type": "application/json" },
        });
      } catch (e) {
        return corsResponse(JSON.stringify({ error: e.message }), {
          status: 500, headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Stripe: Create Payment Intent for Freeze (preset pricing)
    if (url.pathname === "/create-freeze-intent" && request.method === "POST") {
      try {
        const body = await request.json();
        const targetName = String(body.targetName || "").slice(0, 20);
        if (!targetName) {
          return corsResponse(JSON.stringify({ error: "targetName required" }), {
            status: 400, headers: { "Content-Type": "application/json" },
          });
        }
        const freezePriceMap = {2:200,5:300,10:500,15:700,30:1000,60:1500,120:2500,180:3500,240:4500,360:6000};
        const reqMin = Math.floor(Number(body.durationMin) || 2);
        const durationMin = freezePriceMap[reqMin] ? reqMin : 2;
        const amount = freezePriceMap[durationMin];
        const stripeRes = await fetch("https://api.stripe.com/v1/payment_intents", {
          method: "POST",
          headers: {
            Authorization: "Basic " + btoa(env.STRIPE_SECRET_KEY + ":"),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            amount: String(amount), currency: "usd",
            "automatic_payment_methods[enabled]": "true",
            description: "Freeze " + targetName + " for " + durationMin + " min - Jared Clicker",
            "metadata[targetName]": targetName, "metadata[type]": "freeze", "metadata[durationMin]": String(durationMin),
          }).toString(),
        });
        const intent = await stripeRes.json();
        if (intent.error) {
          return corsResponse(JSON.stringify({ error: intent.error.message }), {
            status: 400, headers: { "Content-Type": "application/json" },
          });
        }
        return corsResponse(JSON.stringify({ clientSecret: intent.client_secret }), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (e) {
        return corsResponse(JSON.stringify({ error: e.message }), {
          status: 500, headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Apply freeze (0x multiplier - stored as sabotage with freeze flag)
    if (url.pathname === "/freeze" && request.method === "POST") {
      try {
        const body = await request.json();
        const attackerName = String(body.attackerName || "").slice(0, 20);
        const targetName = String(body.targetName || "").slice(0, 20);
        const durationMin = body.durationMin || 2;
        if (!attackerName || !targetName) {
          return corsResponse(JSON.stringify({ error: "attackerName and targetName required" }), {
            status: 400, headers: { "Content-Type": "application/json" },
          });
        }
        const freezePriceMap = {2:200,5:300,10:500,15:700,30:1000,60:1500,120:2500,180:3500,240:4500,360:6000};
        const reqMin = Math.floor(Number(durationMin) || 2);
        const priceCents = freezePriceMap[reqMin] || 200;
        const id = env.LIVE_VISITORS.idFromName("global");
        const obj = env.LIVE_VISITORS.get(id);
        const res = await obj.fetch(new Request("https://dummy/freeze", {
          method: "POST",
          body: JSON.stringify({ attackerName, targetName, durationMin, priceCents }),
        }));
        const result = await res.text();
        return corsResponse(result, {
          status: res.status, headers: { "Content-Type": "application/json" },
        });
      } catch (e) {
        return corsResponse(JSON.stringify({ error: e.message }), {
          status: 500, headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Apply single sabotage (direct payment, no credits needed)
    if (url.pathname === "/single-sabotage" && request.method === "POST") {
      try {
        const body = await request.json();
        const attackerName = String(body.attackerName || "").slice(0, 20);
        const targetName = String(body.targetName || "").slice(0, 20);
        if (!attackerName || !targetName) {
          return corsResponse(JSON.stringify({ error: "attackerName and targetName required" }), {
            status: 400, headers: { "Content-Type": "application/json" },
          });
        }
        const id = env.LIVE_VISITORS.idFromName("global");
        const obj = env.LIVE_VISITORS.get(id);
        const res = await obj.fetch(new Request("https://dummy/sabotage", {
          method: "POST",
          body: JSON.stringify({ attackerName, targetName }),
        }));
        const result = await res.text();
        return corsResponse(result, {
          status: res.status, headers: { "Content-Type": "application/json" },
        });
      } catch (e) {
        return corsResponse(JSON.stringify({ error: e.message }), {
          status: 500, headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Stripe: Create Payment Intent for Day-Long Sabotage ($20)
    if (url.pathname === "/create-day-sabotage-intent" && request.method === "POST") {
      try {
        const body = await request.json();
        const targetName = String(body.targetName || "").slice(0, 20);
        if (!targetName) {
          return corsResponse(JSON.stringify({ error: "targetName required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const stripeRes = await fetch(
          "https://api.stripe.com/v1/payment_intents",
          {
            method: "POST",
            headers: {
              Authorization: "Basic " + btoa(env.STRIPE_SECRET_KEY + ":"),
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              amount: "2000",
              currency: "usd",
              "automatic_payment_methods[enabled]": "true",
              description: "Day-long sabotage on " + targetName + " - Jared Clicker",
              "metadata[targetName]": targetName,
              "metadata[type]": "day-sabotage",
            }).toString(),
          }
        );

        const intent = await stripeRes.json();
        if (intent.error) {
          return corsResponse(JSON.stringify({ error: intent.error.message }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        return corsResponse(
          JSON.stringify({ clientSecret: intent.client_secret }),
          { headers: { "Content-Type": "application/json" } }
        );
      } catch (e) {
        return corsResponse(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Buy credits: add 5 sabotage credits for a player
    if (url.pathname === "/buy-credits" && request.method === "POST") {
      try {
        const body = await request.json();
        const playerName = String(body.playerName || "").slice(0, 20);
        if (!playerName) {
          return corsResponse(JSON.stringify({ error: "playerName required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        const id = env.LIVE_VISITORS.idFromName("global");
        const obj = env.LIVE_VISITORS.get(id);
        const res = await obj.fetch(new Request("https://dummy/credits/add", {
          method: "POST",
          body: JSON.stringify({ playerName, count: 5 }),
        }));
        const result = await res.text();
        return corsResponse(result, {
          status: res.status,
          headers: { "Content-Type": "application/json" },
        });
      } catch (e) {
        return corsResponse(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Sabotage: apply slowdown (uses a credit for non-day sabotages)
    if (url.pathname === "/sabotage" && request.method === "POST") {
      try {
        const body = await request.json();
        const attackerName = String(body.attackerName || "").slice(0, 20);
        const targetName = String(body.targetName || "").slice(0, 20);
        if (!attackerName || !targetName) {
          return corsResponse(JSON.stringify({ error: "attackerName and targetName required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        const durationMs = body.durationMs ? Number(body.durationMs) : undefined;
        const id = env.LIVE_VISITORS.idFromName("global");
        const obj = env.LIVE_VISITORS.get(id);

        // For non-day sabotages (no durationMs or <= 15min), use a credit
        const isDay = durationMs && durationMs > 15 * 60 * 1000;
        if (!isDay) {
          const creditRes = await obj.fetch(new Request("https://dummy/credits/use", {
            method: "POST",
            body: JSON.stringify({ playerName: attackerName }),
          }));
          if (creditRes.status !== 200) {
            const creditErr = await creditRes.json();
            return corsResponse(JSON.stringify({ error: creditErr.error || "No sabotage credits" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }
        }

        const res = await obj.fetch(new Request("https://dummy/sabotage", {
          method: "POST",
          body: JSON.stringify({ attackerName, targetName, durationMs }),
        }));
        const result = await res.text();
        return corsResponse(result, {
          status: res.status,
          headers: { "Content-Type": "application/json" },
        });
      } catch (e) {
        return corsResponse(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Stripe: Create Payment Intent for Unsabotage (dynamic price: freeze = attacker's cost, slow = $0.99)
    if (url.pathname === "/create-unsabotage-intent" && request.method === "POST") {
      try {
        const body = await request.json();
        const targetName = String(body.targetName || "").slice(0, 20);
        // Query DO for break-free price
        const doId = env.LIVE_VISITORS.idFromName("global");
        const doObj = env.LIVE_VISITORS.get(doId);
        const priceRes = await doObj.fetch(new Request("https://dummy/break-free-price", {
          method: "POST",
          body: JSON.stringify({ targetName }),
        }));
        const priceData = await priceRes.json();
        const amount = priceData.priceCents || 99;
        const stripeRes = await fetch(
          "https://api.stripe.com/v1/payment_intents",
          {
            method: "POST",
            headers: {
              Authorization: "Basic " + btoa(env.STRIPE_SECRET_KEY + ":"),
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              amount: String(amount),
              currency: "usd",
              "automatic_payment_methods[enabled]": "true",
              description: "Break free from sabotage - Jared Clicker",
              "metadata[type]": "unsabotage",
            }).toString(),
          }
        );
        const intent = await stripeRes.json();
        if (intent.error) {
          return corsResponse(JSON.stringify({ error: intent.error.message }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        return corsResponse(
          JSON.stringify({ clientSecret: intent.client_secret }),
          { headers: { "Content-Type": "application/json" } }
        );
      } catch (e) {
        return corsResponse(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Unsabotage: remove sabotage after payment
    if (url.pathname === "/unsabotage" && request.method === "POST") {
      try {
        const body = await request.json();
        const targetName = String(body.targetName || "").slice(0, 20);
        if (!targetName) {
          return corsResponse(JSON.stringify({ error: "targetName required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        const id = env.LIVE_VISITORS.idFromName("global");
        const obj = env.LIVE_VISITORS.get(id);
        const res = await obj.fetch(new Request("https://dummy/unsabotage", {
          method: "POST",
          body: JSON.stringify({ targetName }),
        }));
        const result = await res.text();
        return corsResponse(result, {
          status: res.status,
          headers: { "Content-Type": "application/json" },
        });
      } catch (e) {
        return corsResponse(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Admin: get all leaderboard entries
    if (url.pathname === "/admin/leaderboard" && request.method === "GET") {
      if (!(await verifyAdmin(request, env))) {
        return corsResponse(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      const id = env.LIVE_VISITORS.idFromName("global");
      const obj = env.LIVE_VISITORS.get(id);
      const res = await obj.fetch(new Request("https://dummy/admin/all-scores", { method: "GET" }));
      const body = await res.text();
      return corsResponse(body, {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Admin: delete a score
    if (url.pathname === "/admin/delete-score" && request.method === "POST") {
      if (!(await verifyAdmin(request, env))) {
        return corsResponse(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      const id = env.LIVE_VISITORS.idFromName("global");
      const obj = env.LIVE_VISITORS.get(id);
      const res = await obj.fetch(new Request("https://dummy/admin/delete-score", {
        method: "POST",
        body: request.body,
      }));
      const body = await res.text();
      return corsResponse(body, {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Photos: list all uploaded photos (public) — exclude skin assets
    if (url.pathname === "/photos" && request.method === "GET") {
      const fullList = await env.PHOTOS.list();
      const list = { objects: fullList.objects.filter(function(o) { return !o.key.startsWith("skins/"); }) };
      // Fetch display name overrides from LiveVisitors DO
      const doId = env.LIVE_VISITORS.idFromName("global");
      const doObj = env.LIVE_VISITORS.get(doId);
      const namesRes = await doObj.fetch(new Request("https://dummy/photo-names/get", { method: "GET" }));
      const photoNames = await namesRes.json();
      const photos = list.objects.map((o) => ({
        key: o.key,
        url: "/photos/" + encodeURIComponent(o.key),
        size: o.size,
        uploaded: o.uploaded,
        displayName: photoNames[o.key] || null,
      }));
      return corsResponse(JSON.stringify(photos), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Photos: serve a photo (public)
    if (url.pathname.startsWith("/photos/") && request.method === "GET") {
      const key = decodeURIComponent(url.pathname.slice(8));
      const obj = await env.PHOTOS.get(key);
      if (!obj) {
        return corsResponse("Not found", { status: 404 });
      }
      const headers = new Headers();
      headers.set("Content-Type", obj.httpMetadata?.contentType || "image/png");
      headers.set("Cache-Control", "public, max-age=86400");
      headers.set("Access-Control-Allow-Origin", "*");
      return new Response(obj.body, { headers });
    }

    // Admin: upload a photo
    if (url.pathname === "/admin/upload-photo" && request.method === "POST") {
      if (!(await verifyAdmin(request, env))) {
        return corsResponse(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      const formData = await request.formData();
      const file = formData.get("photo");
      if (!file) {
        return corsResponse(JSON.stringify({ error: "No file provided" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      const key = Date.now() + "-" + file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      await env.PHOTOS.put(key, file.stream(), {
        httpMetadata: { contentType: file.type },
      });
      return corsResponse(JSON.stringify({ ok: true, key, url: "/photos/" + key }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Admin: delete a photo
    if (url.pathname === "/admin/delete-photo" && request.method === "POST") {
      if (!(await verifyAdmin(request, env))) {
        return corsResponse(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      const body = await request.json();
      if (!body.key) {
        return corsResponse(JSON.stringify({ error: "key required" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      await env.PHOTOS.delete(body.key);
      return corsResponse(JSON.stringify({ ok: true, deleted: body.key }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Admin: set display name for a photo
    if (url.pathname === "/admin/set-photo-name" && request.method === "POST") {
      if (!(await verifyAdmin(request, env))) {
        return corsResponse(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      const body = await request.json();
      const key = String(body.key || "");
      const displayName = String(body.displayName || "").slice(0, 30);
      if (!key) {
        return corsResponse(JSON.stringify({ error: "key required" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      const doId = env.LIVE_VISITORS.idFromName("global");
      const doObj = env.LIVE_VISITORS.get(doId);
      const res = await doObj.fetch(new Request("https://dummy/photo-names/set", {
        method: "POST",
        body: JSON.stringify({ key, displayName }),
      }));
      const result = await res.text();
      return corsResponse(result, {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Total raised using balance_transactions (exact net after Stripe fees)
    if (url.pathname === "/total-raised" && request.method === "GET") {
      try {
        const now = Date.now();
        if (totalRaisedCache && (now - totalRaisedCache.timestamp) < 30 * 1000) {
          return corsResponse(JSON.stringify(totalRaisedCache.data), {
            headers: { "Content-Type": "application/json" },
          });
        }
        let totalNetCents = 0;
        let transactionCount = 0;
        let hasMore = true;
        let startingAfter = null;
        while (hasMore) {
          const params = new URLSearchParams({ limit: "100" });
          if (startingAfter) params.set("starting_after", startingAfter);
          const stripeRes = await fetch(
            "https://api.stripe.com/v1/balance_transactions?" + params.toString(),
            { headers: { Authorization: "Basic " + btoa(env.STRIPE_SECRET_KEY + ":") } }
          );
          const result = await stripeRes.json();
          if (!result.data || result.data.length === 0) break;
          for (let i = 0; i < result.data.length; i++) {
            const bt = result.data[i];
            if ((bt.type === "charge" || bt.type === "payment") && bt.net > 0) {
              totalNetCents += bt.net;
              transactionCount++;
            }
          }
          hasMore = result.has_more === true;
          if (hasMore) startingAfter = result.data[result.data.length - 1].id;
        }
        // Deduct API costs for custom skin generation from total raised
        let totalApiCostCents = 0;
        try {
          const doId = env.LIVE_VISITORS.idFromName("global");
          const doObj = env.LIVE_VISITORS.get(doId);
          const apiCostRes = await doObj.fetch(new Request("https://dummy/skins/total-api-cost", { method: "GET" }));
          const apiCostData = await apiCostRes.json();
          totalApiCostCents = apiCostData.totalApiCostCents || 0;
        } catch(e) {}
        const adjustedNetCents = totalNetCents - totalApiCostCents;
        const data = { totalRaisedCents: adjustedNetCents, transactionCount: transactionCount, apiCostCents: totalApiCostCents };
        totalRaisedCache = { data: data, timestamp: now };
        return corsResponse(JSON.stringify(data), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (e) {
        return corsResponse(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // ===== SKIN PACK SYSTEM =====

    // Pre-built skin catalog
    const SKIN_CATALOG = {
      pirate: { name: "Pirate", description: "Ahoy! Sail the seven smelly seas", color: "#b8860b" },
      cyberpunk: { name: "Cyberpunk", description: "Neon-lit stink of the future", color: "#00f0ff" },
      space: { name: "Space", description: "Galactic funk across the cosmos", color: "#7c3aed" },
      medieval: { name: "Medieval", description: "Ye olde stench of the kingdom", color: "#8b4513" },
      underwater: { name: "Underwater", description: "Deep sea funk from the abyss", color: "#0891b2" },
    };
    const SKIN_ASSETS = ["coin", "background", "banner", "icon", "particle"];
    const SKIN_PRICE_CENTS = 599;

    // Gemini prompt templates for skin generation
    var REF_INSTRUCTION = "IMPORTANT: Use the attached reference image as the character reference. The man on this coin is 'Jared' — you MUST preserve his exact likeness, face shape, and features in the new image. Re-imagine him in the new theme but keep him recognizable. ";
    // Which assets should include the Jared reference image
    var ASSETS_WITH_REF = { coin: true, banner: true, icon: true };
    function getSkinPrompts(theme) {
      // Extract a short label for rim text (first 2-3 words max) from user description
      var themeWords = theme.trim().split(/\s+/);
      var shortTheme = themeWords.slice(0, Math.min(3, themeWords.length)).join(" ");
      var rimText = shortTheme.toUpperCase();
      return {
        coin: REF_INSTRUCTION + "Create a circular coin game asset for a clicker game. The user's theme description is: \"" + theme + "\". The coin MUST feature the EXACT SAME man from the reference image — same face shape, same hairstyle, same facial features — but dressed/styled to match this theme. Keep his likeness consistent and recognizable. Surround him with decorative border elements and small thematic icons. The coin should have a metallic gold sheen and look like a real collectible token. CRITICAL: The coin must be on a SOLID COLORED background (gold, dark, or theme-appropriate) — absolutely NO transparency, NO checkerboard, NO alpha channel. The coin should fill the entire image. The ONLY text on the rim should be exactly 'JARED IS " + rimText + "' — do NOT put the full description or any other text on the coin. High quality, detailed, game-ready asset, circular shape.",
        background: "Create a seamless background pattern for a clicker game UI. The user's theme description is: \"" + theme + "\". Dark, moody atmosphere suitable for a game interface. Include subtle related motifs and patterns. Color palette should complement the theme with deep, rich tones. No text. No characters. Just an atmospheric background pattern. Style: dark game UI background, subtle patterns, not too busy or distracting.",
        banner: REF_INSTRUCTION + "Create a decorative header banner for a clicker game. The user's theme description is: \"" + theme + "\". Wide horizontal banner shape. The SAME man from the reference coin image should appear as a small motif or emblem within the banner design — keep his face recognizable. Include themed ornamental elements on both sides. Leave space in the center for game title text overlay. Dark background with glowing themed accent colors. Style: game UI banner, ornate but not cluttered, horizontal layout.",
        icon: REF_INSTRUCTION + "Create a small square app icon for a clicker game. The user's theme description is: \"" + theme + "\". Feature the EXACT SAME man from the reference image on a coin — keep his face, hairstyle, and expression recognizable but simplified for small sizes. Dress/style him to match the theme. Bold, recognizable at small sizes. Style: mobile app icon, clean, bold, square with rounded corners. SOLID background color, no transparency.",
        particle: "Create a small particle effect sprite for a clicker game. The user's theme description is: \"" + theme + "\". This appears when the player clicks the coin. Small burst of themed sparkles, stars, or thematic elements. Transparent background. Bright, eye-catching colors matching the theme. Style: game particle effect, small sprite, transparent background, vibrant.",
      };
    }

    // Call Gemini API to generate one image, returns { base64, tokens }
    // referenceImages can be a single base64 string or an array of base64 strings
    async function callGemini(apiKey, prompt, referenceImages) {
      var parts = [];
      var refs = !referenceImages ? [] : Array.isArray(referenceImages) ? referenceImages : [referenceImages];
      for (var ri = 0; ri < refs.length; ri++) {
        parts.push({ inlineData: { mimeType: "image/png", data: refs[ri] } });
      }
      if (refs.length > 0) {
        parts.push({ text: "Using the " + refs.length + " reference image(s) above: " + prompt });
      } else {
        parts.push({ text: prompt });
      }
      var payload = {
        contents: [{ parts: parts }],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
          imageConfig: { imageSize: "1K" },
        },
      };
      var res = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=" + apiKey,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
      );
      var result = await res.json();
      if (result.error) {
        return { error: result.error.message };
      }
      var candidates = result.candidates || [];
      var imageData = null;
      for (var ci = 0; ci < (candidates[0]?.content?.parts || []).length; ci++) {
        var part = candidates[0].content.parts[ci];
        if (part.inlineData) imageData = part.inlineData.data;
      }
      // Extract token usage for cost tracking
      var usage = result.usageMetadata || {};
      var outputTokens = usage.candidatesTokenCount || usage.totalTokenCount || 1120;
      return { base64: imageData, outputTokens: outputTokens, inputTokens: usage.promptTokenCount || 0 };
    }

    // List available skins (catalog + ownership for a player)
    if (url.pathname === "/skins" && request.method === "GET") {
      var playerName = url.searchParams.get("player") || "";
      // Load owned skins from DO
      var doId = env.LIVE_VISITORS.idFromName("global");
      var doObj = env.LIVE_VISITORS.get(doId);
      var ownedRes = await doObj.fetch(new Request("https://dummy/skins/owned?player=" + encodeURIComponent(playerName), { method: "GET" }));
      var owned = await ownedRes.json();
      var catalog = [];
      for (var skinId in SKIN_CATALOG) {
        var entry = SKIN_CATALOG[skinId];
        catalog.push({
          id: skinId,
          name: entry.name,
          description: entry.description,
          color: entry.color,
          priceCents: SKIN_PRICE_CENTS,
          owned: owned.indexOf(skinId) >= 0,
          custom: false,
          assets: SKIN_ASSETS.map(function(a) { return "/skins/" + skinId + "/" + a + ".png"; }),
        });
      }
      // Also include custom skins the player owns
      var customRes = await doObj.fetch(new Request("https://dummy/skins/custom?player=" + encodeURIComponent(playerName), { method: "GET" }));
      var customSkins = await customRes.json();
      for (var ci = 0; ci < customSkins.length; ci++) {
        catalog.push(customSkins[ci]);
      }
      return corsResponse(JSON.stringify(catalog), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Serve skin assets from R2
    if (url.pathname.startsWith("/skins/") && request.method === "GET") {
      var skinPath = url.pathname.slice(7); // e.g. "pirate/coin.png"
      var r2Key = "skins/" + skinPath;
      var obj = await env.PHOTOS.get(r2Key);
      if (!obj) {
        return corsResponse("Not found", { status: 404 });
      }
      var headers = new Headers();
      headers.set("Content-Type", obj.httpMetadata?.contentType || "image/png");
      headers.set("Cache-Control", "public, max-age=604800");
      headers.set("Access-Control-Allow-Origin", "*");
      return new Response(obj.body, { headers });
    }

    // Create Stripe payment intent for skin purchase ($5.99)
    if (url.pathname === "/create-skin-intent" && request.method === "POST") {
      try {
        var body = await request.json();
        var skinId = String(body.skinId || "").slice(0, 50);
        var playerName = String(body.playerName || "").slice(0, 20);
        var isCustom = !!body.custom;
        if (!skinId || !playerName) {
          return corsResponse(JSON.stringify({ error: "skinId and playerName required" }), {
            status: 400, headers: { "Content-Type": "application/json" },
          });
        }
        var desc = isCustom
          ? "Custom skin pack for " + playerName + " - Jared Clicker"
          : SKIN_CATALOG[skinId]?.name + " skin pack for " + playerName + " - Jared Clicker";
        var stripeRes = await fetch("https://api.stripe.com/v1/payment_intents", {
          method: "POST",
          headers: {
            Authorization: "Basic " + btoa(env.STRIPE_SECRET_KEY + ":"),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            amount: String(SKIN_PRICE_CENTS), currency: "usd",
            "automatic_payment_methods[enabled]": "true",
            description: desc,
            "metadata[type]": "skin-pack",
            "metadata[skinId]": skinId,
            "metadata[playerName]": playerName,
            "metadata[custom]": isCustom ? "true" : "false",
          }).toString(),
        });
        var intent = await stripeRes.json();
        if (intent.error) {
          return corsResponse(JSON.stringify({ error: intent.error.message }), {
            status: 400, headers: { "Content-Type": "application/json" },
          });
        }
        return corsResponse(JSON.stringify({ clientSecret: intent.client_secret }), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (e) {
        return corsResponse(JSON.stringify({ error: e.message }), {
          status: 500, headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Unlock a pre-built skin after payment
    if (url.pathname === "/unlock-skin" && request.method === "POST") {
      try {
        var body = await request.json();
        var skinId = String(body.skinId || "");
        var playerName = String(body.playerName || "").slice(0, 20);
        if (!skinId || !playerName) {
          return corsResponse(JSON.stringify({ error: "skinId and playerName required" }), {
            status: 400, headers: { "Content-Type": "application/json" },
          });
        }
        var doId = env.LIVE_VISITORS.idFromName("global");
        var doObj = env.LIVE_VISITORS.get(doId);
        var res = await doObj.fetch(new Request("https://dummy/skins/unlock", {
          method: "POST",
          body: JSON.stringify({ skinId, playerName }),
        }));
        var result = await res.text();
        return corsResponse(result, {
          status: res.status, headers: { "Content-Type": "application/json" },
        });
      } catch (e) {
        return corsResponse(JSON.stringify({ error: e.message }), {
          status: 500, headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Equip a skin
    if (url.pathname === "/equip-skin" && request.method === "POST") {
      try {
        var body = await request.json();
        var skinId = String(body.skinId || "");
        var playerName = String(body.playerName || "").slice(0, 20);
        if (!playerName) {
          return corsResponse(JSON.stringify({ error: "playerName required" }), {
            status: 400, headers: { "Content-Type": "application/json" },
          });
        }
        var doId = env.LIVE_VISITORS.idFromName("global");
        var doObj = env.LIVE_VISITORS.get(doId);
        var res = await doObj.fetch(new Request("https://dummy/skins/equip", {
          method: "POST",
          body: JSON.stringify({ skinId, playerName }),
        }));
        var result = await res.text();
        return corsResponse(result, {
          status: res.status, headers: { "Content-Type": "application/json" },
        });
      } catch (e) {
        return corsResponse(JSON.stringify({ error: e.message }), {
          status: 500, headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Update custom skin metadata (creator only)
    if (url.pathname === "/update-skin-meta" && request.method === "POST") {
      try {
        var body = await request.json();
        var doId = env.LIVE_VISITORS.idFromName("global");
        var doObj = env.LIVE_VISITORS.get(doId);
        var res = await doObj.fetch(new Request("https://dummy/skins/update-meta", {
          method: "POST",
          body: JSON.stringify(body),
        }));
        var result = await res.text();
        return corsResponse(result, {
          status: res.status, headers: { "Content-Type": "application/json" },
        });
      } catch (e) {
        return corsResponse(JSON.stringify({ error: e.message }), {
          status: 500, headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Publish a custom skin to the marketplace
    if (url.pathname === "/publish-skin" && request.method === "POST") {
      try {
        var body = await request.json();
        var skinId = String(body.skinId || "");
        var playerName = String(body.playerName || "").slice(0, 20);
        var doId = env.LIVE_VISITORS.idFromName("global");
        var doObj = env.LIVE_VISITORS.get(doId);
        var res = await doObj.fetch(new Request("https://dummy/skins/publish", {
          method: "POST",
          body: JSON.stringify({ skinId, playerName }),
        }));
        var result = await res.text();
        return corsResponse(result, {
          status: res.status, headers: { "Content-Type": "application/json" },
        });
      } catch (e) {
        return corsResponse(JSON.stringify({ error: e.message }), {
          status: 500, headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Get community marketplace skins
    if (url.pathname === "/skin-marketplace" && request.method === "GET") {
      try {
        var doId = env.LIVE_VISITORS.idFromName("global");
        var doObj = env.LIVE_VISITORS.get(doId);
        var res = await doObj.fetch(new Request("https://dummy/skins/marketplace", { method: "GET" }));
        var result = await res.text();
        return corsResponse(result, {
          status: res.status, headers: { "Content-Type": "application/json" },
        });
      } catch (e) {
        return corsResponse(JSON.stringify({ error: e.message }), {
          status: 500, headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Regenerate a custom skin (one free regen)
    if (url.pathname === "/regenerate-skin" && request.method === "POST") {
      try {
        var body = await request.json();
        var skinId = String(body.skinId || "");
        var playerName = String(body.playerName || "").slice(0, 20);

        // Check eligibility via DO
        var doId = env.LIVE_VISITORS.idFromName("global");
        var doObj = env.LIVE_VISITORS.get(doId);
        var eligRes = await doObj.fetch(new Request("https://dummy/skins/regenerate", {
          method: "POST",
          body: JSON.stringify({ skinId, playerName }),
        }));
        var eligData = await eligRes.json();
        if (!eligData.ok) {
          return corsResponse(JSON.stringify({ error: eligData.error || "Cannot regenerate" }), {
            status: eligRes.status, headers: { "Content-Type": "application/json" },
          });
        }

        // Re-generate all assets
        var description = eligData.description;
        var prompts = getSkinPrompts(description);
        var totalOutputTokens = 0;
        var totalInputTokens = 0;
        var generatedAssets = [];
        var errors = [];

        // Load Jared reference
        var jaredRefBase64 = null;
        try {
          var refObj = await env.PHOTOS.get("skins/jared-coin-reference.png");
          if (refObj) {
            var refBuf = await refObj.arrayBuffer();
            jaredRefBase64 = btoa(String.fromCharCode.apply(null, new Uint8Array(refBuf)));
          }
        } catch(e) {}

        for (var ai = 0; ai < SKIN_ASSETS.length; ai++) {
          var assetName = SKIN_ASSETS[ai];
          var prompt = prompts[assetName];
          var refsToSend = [];
          if (ASSETS_WITH_REF[assetName] && jaredRefBase64) refsToSend.push(jaredRefBase64);
          var result = await callGemini(env.GEMINI_API_KEY, prompt, refsToSend.length > 0 ? refsToSend : null);
          if (result.error || !result.base64) {
            errors.push(assetName + ": " + (result.error || "no image returned"));
            continue;
          }
          totalOutputTokens += result.outputTokens;
          totalInputTokens += result.inputTokens;
          var r2Key = "skins/" + skinId + "/" + assetName + ".png";
          var imageBytes = Uint8Array.from(atob(result.base64), function(c) { return c.charCodeAt(0); });
          await env.PHOTOS.put(r2Key, imageBytes, {
            httpMetadata: { contentType: "image/png" },
          });
          generatedAssets.push(assetName);
        }

        // Update API cost
        var apiCostCents = Math.ceil((totalOutputTokens * 0.06 + totalInputTokens * 0.015) / 10);
        await doObj.fetch(new Request("https://dummy/skins/update-api-cost", {
          method: "POST",
          body: JSON.stringify({ skinId, additionalCostCents: apiCostCents, totalOutputTokens, totalInputTokens }),
        }));

        return corsResponse(JSON.stringify({
          ok: true,
          assets: generatedAssets,
          errors: errors,
          apiCostCents: apiCostCents,
        }), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (e) {
        return corsResponse(JSON.stringify({ error: e.message }), {
          status: 500, headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Generate a custom skin pack after payment (server-side Gemini call)
    if (url.pathname === "/generate-custom-skin" && request.method === "POST") {
      try {
        var body = await request.json();
        var description = String(body.description || "").slice(0, 500);
        var playerName = String(body.playerName || "").slice(0, 20);
        // Support single or multiple reference images from client
        var userRefs = body.referenceImages || (body.referenceImage ? [body.referenceImage] : []);
        if (!description || !playerName) {
          return corsResponse(JSON.stringify({ error: "description and playerName required" }), {
            status: 400, headers: { "Content-Type": "application/json" },
          });
        }
        var customId = "custom_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
        var prompts = getSkinPrompts(description);
        var totalOutputTokens = 0;
        var totalInputTokens = 0;
        var generatedAssets = [];
        var errors = [];

        // Always load Jared reference from R2 for character consistency
        var jaredRefBase64 = null;
        try {
          var refObj = await env.PHOTOS.get("skins/jared-coin-reference.png");
          if (refObj) {
            var refBuf = await refObj.arrayBuffer();
            jaredRefBase64 = btoa(String.fromCharCode.apply(null, new Uint8Array(refBuf)));
          }
        } catch(e) {}

        for (var ai = 0; ai < SKIN_ASSETS.length; ai++) {
          var assetName = SKIN_ASSETS[ai];
          var prompt = prompts[assetName];
          // Build reference list: Jared ref for character assets + user refs for style
          var refsToSend = [];
          if (ASSETS_WITH_REF[assetName] && jaredRefBase64) refsToSend.push(jaredRefBase64);
          for (var uri = 0; uri < userRefs.length; uri++) refsToSend.push(userRefs[uri]);
          var result = await callGemini(env.GEMINI_API_KEY, prompt, refsToSend.length > 0 ? refsToSend : null);
          if (result.error || !result.base64) {
            errors.push(assetName + ": " + (result.error || "no image returned"));
            continue;
          }
          totalOutputTokens += result.outputTokens;
          totalInputTokens += result.inputTokens;
          // Store in R2
          var r2Key = "skins/" + customId + "/" + assetName + ".png";
          var imageBytes = Uint8Array.from(atob(result.base64), function(c) { return c.charCodeAt(0); });
          await env.PHOTOS.put(r2Key, imageBytes, {
            httpMetadata: { contentType: "image/png" },
          });
          generatedAssets.push(assetName);
        }

        // Calculate actual API cost from tokens
        // gemini-3.1-flash-image-preview: output $0.06/1K tokens, input $0.015/1K tokens
        var apiCostCents = Math.ceil((totalOutputTokens * 0.06 + totalInputTokens * 0.015) / 10);

        // Store custom skin metadata + ownership in DO
        var doId = env.LIVE_VISITORS.idFromName("global");
        var doObj = env.LIVE_VISITORS.get(doId);
        await doObj.fetch(new Request("https://dummy/skins/save-custom", {
          method: "POST",
          body: JSON.stringify({
            skinId: customId,
            playerName: playerName,
            description: description,
            assets: generatedAssets,
            apiCostCents: apiCostCents,
            totalOutputTokens: totalOutputTokens,
            totalInputTokens: totalInputTokens,
          }),
        }));

        // Update the Stripe payment intent metadata with actual API cost
        if (body.paymentIntentId && env.STRIPE_SECRET_KEY) {
          await fetch("https://api.stripe.com/v1/payment_intents/" + body.paymentIntentId, {
            method: "POST",
            headers: {
              Authorization: "Basic " + btoa(env.STRIPE_SECRET_KEY + ":"),
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              "metadata[apiCostCents]": String(apiCostCents),
              "metadata[outputTokens]": String(totalOutputTokens),
              "metadata[inputTokens]": String(totalInputTokens),
              "metadata[assetsGenerated]": String(generatedAssets.length),
            }).toString(),
          });
        }

        return corsResponse(JSON.stringify({
          ok: true,
          skinId: customId,
          assets: generatedAssets,
          errors: errors,
          apiCostCents: apiCostCents,
          totalOutputTokens: totalOutputTokens,
        }), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (e) {
        return corsResponse(JSON.stringify({ error: e.message }), {
          status: 500, headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Hide Luke (player calls after payment, or admin forwards)
    if (url.pathname === "/hide-luke" && request.method === "POST") {
      const reqBody = await request.json();
      const id = env.LIVE_VISITORS.idFromName("global");
      const obj = env.LIVE_VISITORS.get(id);
      const res = await obj.fetch(new Request("https://dummy/hide-luke", {
        method: "POST",
        body: JSON.stringify(reqBody),
      }));
      const body = await res.text();
      return corsResponse(body, { status: res.status, headers: { "Content-Type": "application/json" } });
    }

    // Admin: hide luke for a player
    if (url.pathname === "/admin/hide-luke" && request.method === "POST") {
      if (!(await verifyAdmin(request, env))) {
        return corsResponse(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
      }
      const reqBody = await request.json();
      const id = env.LIVE_VISITORS.idFromName("global");
      const obj = env.LIVE_VISITORS.get(id);
      const res = await obj.fetch(new Request("https://dummy/hide-luke", {
        method: "POST",
        body: JSON.stringify({ playerName: reqBody.playerName, durationMs: (reqBody.durationMinutes || 60) * 60000 }),
      }));
      const body = await res.text();
      return corsResponse(body, { status: res.status, headers: { "Content-Type": "application/json" } });
    }

    // ===== GAME MONETIZATION =====
    // Double or Nothing: after losing, pay $0.99 to replay with 2x wager
    if (url.pathname === "/create-double-intent" && request.method === "POST") {
      try {
        const stripeRes = await fetch("https://api.stripe.com/v1/payment_intents", {
          method: "POST",
          headers: { Authorization: "Basic " + btoa(env.STRIPE_SECRET_KEY + ":"), "Content-Type": "application/x-www-form-urlencoded" },
          body: "amount=99&currency=usd&description=" + encodeURIComponent("Double or Nothing") + "&metadata[type]=double_or_nothing",
        });
        const intent = await stripeRes.json();
        if (intent.error) return corsResponse(JSON.stringify({ error: intent.error.message }), { status: 400, headers: { "Content-Type": "application/json" } });
        return corsResponse(JSON.stringify({ clientSecret: intent.client_secret }), { headers: { "Content-Type": "application/json" } });
      } catch (e) {
        return corsResponse(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
    }

    // ===== TAB ICON GENERATION (admin) =====
    if (url.pathname === "/generate-tab-icons" && request.method === "POST") {
      if (!(await verifyAdmin(request, env))) {
        return corsResponse(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
      }
      try {
        const icons = [
          { name: "click", prompt: "Create a single golden coin icon in pixel art style, 64x64 pixels, dark transparent background, shiny metallic gold, suitable for a game tab icon" },
          { name: "shop", prompt: "Create a treasure chest icon in pixel art style, 64x64 pixels, dark transparent background, wooden chest overflowing with gold coins, suitable for a game tab icon" },
          { name: "board", prompt: "Create a golden trophy icon in pixel art style, 64x64 pixels, dark transparent background, gleaming first place trophy, suitable for a game tab icon" },
          { name: "battle", prompt: "Create two crossed swords icon in pixel art style, 64x64 pixels, dark transparent background, metallic silver blades with gold handles, suitable for a game tab icon" },
          { name: "skins", prompt: "Create a paint palette icon in pixel art style, 64x64 pixels, dark transparent background, colorful paint blobs on wooden palette, suitable for a game tab icon" },
        ];
        const results = [];
        for (const icon of icons) {
          const result = await callGemini(env.GEMINI_API_KEY, icon.prompt, []);
          if (result.error) { results.push({ name: icon.name, error: result.error }); continue; }
          const bytes = Uint8Array.from(atob(result.base64), c => c.charCodeAt(0));
          await env.PHOTOS.put("tab-icons/" + icon.name + ".png", bytes, {
            httpMetadata: { contentType: "image/png" },
            customMetadata: { cacheControl: "public, max-age=604800" },
          });
          results.push({ name: icon.name, ok: true });
        }
        return corsResponse(JSON.stringify({ results }), { headers: { "Content-Type": "application/json" } });
      } catch (e) {
        return corsResponse(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
    }

    // Serve tab icons from R2
    if (url.pathname.startsWith("/tab-icons/") && request.method === "GET") {
      const key = url.pathname.slice(1); // "tab-icons/click.png"
      const obj = await env.PHOTOS.get(key);
      if (!obj) return corsResponse("Not found", { status: 404 });
      return new Response(obj.body, {
        headers: { ...corsHeaders, "Content-Type": "image/png", "Cache-Control": "public, max-age=604800" },
      });
    }

    // ===== REMATCH SYSTEM =====
    if (url.pathname === "/create-rematch-intent" && request.method === "POST") {
      try {
        const { gameId } = await request.json();
        if (!gameId) return corsResponse(JSON.stringify({ error: "Missing gameId" }), { status: 400, headers: { "Content-Type": "application/json" } });
        const stripeRes = await fetch("https://api.stripe.com/v1/payment_intents", {
          method: "POST",
          headers: { Authorization: "Basic " + btoa(env.STRIPE_SECRET_KEY + ":"), "Content-Type": "application/x-www-form-urlencoded" },
          body: "amount=199&currency=usd&description=" + encodeURIComponent("Best 2 of 3 Rematch") + "&metadata[type]=rematch&metadata[gameId]=" + encodeURIComponent(gameId),
        });
        const intent = await stripeRes.json();
        if (intent.error) return corsResponse(JSON.stringify({ error: intent.error.message }), { status: 400, headers: { "Content-Type": "application/json" } });
        return corsResponse(JSON.stringify({ clientSecret: intent.client_secret }), { headers: { "Content-Type": "application/json" } });
      } catch (e) {
        return corsResponse(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
    }

    if (url.pathname === "/rematch" && request.method === "POST") {
      try {
        const { gameId, paymentIntentId } = await request.json();
        if (!gameId || !paymentIntentId) return corsResponse(JSON.stringify({ error: "Missing fields" }), { status: 400, headers: { "Content-Type": "application/json" } });
        // Verify payment
        const piRes = await fetch("https://api.stripe.com/v1/payment_intents/" + paymentIntentId, {
          headers: { Authorization: "Basic " + btoa(env.STRIPE_SECRET_KEY + ":") },
        });
        const pi = await piRes.json();
        if (pi.status !== "succeeded") return corsResponse(JSON.stringify({ error: "Payment not completed" }), { status: 400, headers: { "Content-Type": "application/json" } });
        // Forward to DO to create rematch game
        const lvId = env.LIVE_VISITORS.idFromName("global");
        const lvObj = env.LIVE_VISITORS.get(lvId);
        const res = await lvObj.fetch(new Request("https://dummy/rematch", {
          method: "POST",
          body: JSON.stringify({ gameId, paymentIntentId }),
        }));
        const body = await res.text();
        return corsResponse(body, { status: res.status, headers: { "Content-Type": "application/json" } });
      } catch (e) {
        return corsResponse(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
    }

    // Push notification subscribe/unsubscribe (forward to DO)
    if (url.pathname === "/push/subscribe" && request.method === "POST") {
      try {
        const reqBody = await request.json();
        const id = env.LIVE_VISITORS.idFromName("global");
        const obj = env.LIVE_VISITORS.get(id);
        const res = await obj.fetch(new Request("https://dummy/push/subscribe", {
          method: "POST",
          body: JSON.stringify(reqBody),
        }));
        const body = await res.text();
        return corsResponse(body, { status: res.status, headers: { "Content-Type": "application/json" } });
      } catch (e) {
        return corsResponse(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
    }

    if (url.pathname === "/push/unsubscribe" && request.method === "POST") {
      try {
        const reqBody = await request.json();
        const id = env.LIVE_VISITORS.idFromName("global");
        const obj = env.LIVE_VISITORS.get(id);
        const res = await obj.fetch(new Request("https://dummy/push/unsubscribe", {
          method: "POST",
          body: JSON.stringify(reqBody),
        }));
        const body = await res.text();
        return corsResponse(body, { status: res.status, headers: { "Content-Type": "application/json" } });
      } catch (e) {
        return corsResponse(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
    }

    // Version endpoint for auto-refresh
    if (url.pathname === "/version") {
      return corsResponse(JSON.stringify({ version: "53" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Debug endpoint — check DO state (temporary)
    if (url.pathname === "/debug-state") {
      const lvId = env.LIVE_VISITORS.idFromName("global");
      const lvObj = env.LIVE_VISITORS.get(lvId);
      const res = await lvObj.fetch(new Request("https://dummy/debug-state"));
      const body = await res.text();
      return corsResponse(body, { headers: { "Content-Type": "application/json" } });
    }

    // Admin: reset all scores
    if (url.pathname === "/admin/reset-scores" && request.method === "POST") {
      if (!(await verifyAdmin(request, env))) {
        return corsResponse(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { "Content-Type": "application/json" },
        });
      }
      const id = env.LIVE_VISITORS.idFromName("global");
      const obj = env.LIVE_VISITORS.get(id);
      const res = await obj.fetch(new Request("https://dummy/admin/reset-scores", { method: "POST" }));
      const body = await res.text();
      return corsResponse(body, {
        status: res.status, headers: { "Content-Type": "application/json" },
      });
    }

    // Admin: reset individual player
    if (url.pathname === "/admin/reset-player" && request.method === "POST") {
      if (!(await verifyAdmin(request, env))) {
        return corsResponse(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { "Content-Type": "application/json" },
        });
      }
      const reqBody = await request.json();
      const id = env.LIVE_VISITORS.idFromName("global");
      const obj = env.LIVE_VISITORS.get(id);
      const res = await obj.fetch(new Request("https://dummy/admin/reset-player", {
        method: "POST",
        body: JSON.stringify({ playerName: reqBody.playerName }),
      }));
      const body = await res.text();
      return corsResponse(body, {
        status: res.status, headers: { "Content-Type": "application/json" },
      });
    }

    // Admin: add coins to individual player
    if (url.pathname === "/admin/add-coins" && request.method === "POST") {
      if (!(await verifyAdmin(request, env))) {
        return corsResponse(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { "Content-Type": "application/json" },
        });
      }
      const reqBody = await request.json();
      const id = env.LIVE_VISITORS.idFromName("global");
      const obj = env.LIVE_VISITORS.get(id);
      const res = await obj.fetch(new Request("https://dummy/admin/add-coins", {
        method: "POST",
        body: JSON.stringify({ playerName: reqBody.playerName, amount: reqBody.amount }),
      }));
      const body = await res.text();
      return corsResponse(body, {
        status: res.status, headers: { "Content-Type": "application/json" },
      });
    }

    return corsResponse("Jared Clicker API");
  },
};
