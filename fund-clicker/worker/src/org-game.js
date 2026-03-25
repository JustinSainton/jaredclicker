// OrgGameInstance: Per-org Durable Object for Fund Clicker
// Extracted from LiveVisitors (jaredclicker) with multi-tenant adaptations:
//   1. orgConfig injection (branding, currency name, custom trivia)
//   2. Push notifications via Expo Push (replaces VAPID Web Push)
//   3. Parameterized references (no hardcoded "Jared"/"Luke")
//   4. R2 paths scoped to org: /{orgId}/coin.png, /{orgId}/photos/*, etc.
//
// The game engine (scores, battles, sabotage, chat, skins, campaigns, etc.)
// is identical to the original LiveVisitors class.

import { hashPassword, verifyPassword, needsPasswordRehash } from "./auth.js";

// ─── TRIVIA BANK (default — orgs can override via org_config.custom_trivia) ──

const DEFAULT_TRIVIA_BANK = [
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

const HANGMAN_WORDS = [
  "FUNDRAISER", "CLICKTASTIC", "CHAMPION", "DONATION", "GENEROUS",
  "COMMUNITY", "VOLUNTEER", "BLESSING", "GRATEFUL", "MISSION",
  "CHARITY", "SUPPORT", "KINDNESS", "AMAZING", "VICTORY",
];

// Profanity filter (basic)
const PROFANITY_LIST = ["fuck","shit","bitch","ass","dick","damn","hell","crap","bastard","slut","whore","nigger","faggot","retard","cock","pussy","cunt"];

function filterProfanity(text) {
  let filtered = text;
  for (const word of PROFANITY_LIST) {
    const regex = new RegExp(word, "gi");
    filtered = filtered.replace(regex, "*".repeat(word.length));
  }
  return filtered;
}

function parseJSONField(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeOrgConfig(config = {}) {
  return {
    currencyName: config.currencyName || config.currency_name || "coins",
    primaryColor: config.primaryColor || config.primary_color || "#FFD700",
    secondaryColor: config.secondaryColor || config.secondary_color || "#1a1a2e",
    accentColor: config.accentColor || config.accent_color || "#e94560",
    coinImageKey: config.coinImageKey || config.coin_image_key || null,
    characterPhotos: parseJSONField(config.characterPhotos ?? config.character_photos, []),
    upgradeNames: parseJSONField(config.upgradeNames ?? config.upgrade_names, {}),
    customTrivia: parseJSONField(config.customTrivia ?? config.custom_trivia, []),
    priceOverrides: parseJSONField(config.priceOverrides ?? config.price_overrides, {}),
  };
}

function extractBearerToken(request) {
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

// ─── MAIN DO CLASS ───────────────────────────────────────────────────────────

export class OrgGameInstance {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.connections = new Map();

    // Lazy-loaded from DO storage (same as original LiveVisitors)
    this.persistedScores = null;
    this.sabotages = [];
    this.sabotagesLoaded = false;
    this.credits = null;
    this.chatMessages = null;
    this.campaigns = null;
    this.photoNames = null;
    this.accounts = null;
    this.skinData = null;
    this.pushSubscriptions = null;
    this.fulfilledPayments = null;
    this.scoreEpoch = null;
    this.resetSchedule = null;
    this.hallOfFame = null;
    this.bannedPlayers = null;
    this.autobanEnabled = null;

    // Multi-tenant addition: org config (loaded on first request)
    this.orgConfig = null;

    // In-memory state
    this._scoreRateTracker = {};
    this.activeGames = new Map();
    this.pendingChallenges = new Map();
    this.forfeitTimers = new Map();
    this.groupLobbies = new Map();
    this._broadcastPending = false;
    this._debugCounters = { accepted: 0, rejectedEpoch: 0, lastClientEpoch: null, lastSvrEpoch: null };
    this.lastPodium = [];
  }

  // ─── ORG CONFIG ──────────────────────────────────────────────────────────
  // Loaded once from DO storage (set by the router when org is first accessed)

  async loadOrgConfig() {
    if (this.orgConfig === null) {
      this.orgConfig = normalizeOrgConfig(await this.state.storage.get("orgConfig"));
    }
    return this.orgConfig;
  }

  async saveOrgConfig(config) {
    this.orgConfig = normalizeOrgConfig(config);
    await this.state.storage.put("orgConfig", this.orgConfig);
  }

  // Get the trivia bank (custom if configured, otherwise default)
  async getTriviaBank() {
    const config = await this.loadOrgConfig();
    if (config.customTrivia && config.customTrivia.length >= 5) {
      return config.customTrivia;
    }
    return DEFAULT_TRIVIA_BANK;
  }

  // ─── THROTTLED BROADCAST ─────────────────────────────────────────────────

  scheduleBroadcast() {
    if (this._broadcastPending) return;
    this._broadcastPending = true;
    setTimeout(() => {
      this._broadcastPending = false;
      this.broadcast();
    }, 2000);
  }

  // ─── DATA LOADERS (identical to LiveVisitors) ────────────────────────────

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
    const now = Date.now();
    this.sabotages = this.sabotages.filter(s => s.expiresAt > now);
    return this.sabotages;
  }

  async saveSabotages() { await this.state.storage.put("sabotages", this.sabotages); }

  async loadCredits() {
    if (this.credits === null) this.credits = (await this.state.storage.get("credits")) || {};
    return this.credits;
  }

  async saveCredits() { await this.state.storage.put("credits", this.credits); }

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
    if (current <= 0) return { ok: false, error: "No sabotage credits remaining" };
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
    this.sabotages = this.sabotages.filter(s => s.targetName.toLowerCase() !== targetName.toLowerCase());
    await this.saveSabotages();
    await this.addSystemChat(targetName + " broke free!");
    this.broadcast();
  }

  async loadChat() {
    if (this.chatMessages === null) this.chatMessages = (await this.state.storage.get("chatMessages")) || [];
    return this.chatMessages;
  }

  async saveChat() { await this.state.storage.put("chatMessages", this.chatMessages); }

  async loadCampaigns() {
    if (this.campaigns === null) this.campaigns = (await this.state.storage.get("campaigns")) || {};
    return this.campaigns;
  }

  async saveCampaigns() { await this.state.storage.put("campaigns", this.campaigns); }

  async loadPhotoNames() {
    if (this.photoNames === null) this.photoNames = (await this.state.storage.get("photoNames")) || {};
    return this.photoNames;
  }

  async savePhotoNames() { await this.state.storage.put("photoNames", this.photoNames); }

  async loadSkinData() {
    if (this.skinData === null) this.skinData = (await this.state.storage.get("skinData")) || { owned: {}, custom: {}, equipped: {} };
    return this.skinData;
  }

  async saveSkinData() { await this.state.storage.put("skinData", this.skinData); }

  async loadAccounts() {
    if (this.accounts === null) this.accounts = (await this.state.storage.get("accounts")) || {};
    return this.accounts;
  }

  async saveAccounts() { await this.state.storage.put("accounts", this.accounts); }

  async loadFulfilledPayments() {
    if (this.fulfilledPayments === null) {
      this.fulfilledPayments = (await this.state.storage.get("fulfilledPayments")) || {};
    }
    return this.fulfilledPayments;
  }

  async saveFulfilledPayments() { await this.state.storage.put("fulfilledPayments", this.fulfilledPayments); }

  isInternalRequest(request) {
    return request.headers.get("X-Fund-Clicker-Internal") === this.env.JWT_SECRET;
  }

  async authenticatePlayerToken(token, expectedName = null) {
    if (!token) return null;
    const found = await this.findAccountByToken(token);
    if (!found?.account?.displayName) return null;
    if (expectedName && found.account.displayName.toLowerCase() !== String(expectedName).toLowerCase()) {
      return null;
    }
    return {
      key: found.key,
      account: found.account,
      displayName: found.account.displayName,
      token,
    };
  }

  async authorizePlayerRequest(request, expectedName = null) {
    return this.authenticatePlayerToken(extractBearerToken(request), expectedName);
  }

  jsonError(message, status = 401) {
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  sendUnauthorized(ws, reason = "auth_required") {
    try {
      ws.send(JSON.stringify({ type: "unauthorized", reason }));
    } catch {}
  }

  clearForfeitTimerForPlayer(playerName) {
    const lower = playerName.toLowerCase();
    for (const [gameId, pending] of this.forfeitTimers) {
      if (pending.playerName?.toLowerCase() === lower) {
        clearTimeout(pending.timer);
        this.forfeitTimers.delete(gameId);
      }
    }
  }

  async runPaymentFulfillment(paymentIntentId, effect) {
    const id = String(paymentIntentId || "").trim();
    if (!id) {
      throw new Error("paymentIntentId required");
    }

    return this.state.blockConcurrencyWhile(async () => {
      const fulfilled = await this.loadFulfilledPayments();
      if (fulfilled[id]) {
        return { ok: true, alreadyFulfilled: true, paymentIntentId: id };
      }

      const result = await effect();
      fulfilled[id] = { fulfilledAt: Date.now() };

      const keys = Object.keys(fulfilled);
      if (keys.length > 5000) {
        keys
          .sort((a, b) => (fulfilled[a]?.fulfilledAt || 0) - (fulfilled[b]?.fulfilledAt || 0))
          .slice(0, keys.length - 4000)
          .forEach(key => { delete fulfilled[key]; });
      }

      await this.saveFulfilledPayments();
      return { ok: true, paymentIntentId: id, ...result };
    });
  }

  async loadBannedPlayers() {
    if (this.bannedPlayers === null) this.bannedPlayers = (await this.state.storage.get("bannedPlayers")) || {};
    const now = Date.now();
    let changed = false;
    for (const key in this.bannedPlayers) {
      if (this.bannedPlayers[key].until && this.bannedPlayers[key].until <= now) {
        delete this.bannedPlayers[key];
        changed = true;
      }
    }
    if (changed) await this.state.storage.put("bannedPlayers", this.bannedPlayers);
    return this.bannedPlayers;
  }

  async saveBannedPlayers() { await this.state.storage.put("bannedPlayers", this.bannedPlayers); }

  async loadPushSubscriptions() {
    if (this.pushSubscriptions === null) this.pushSubscriptions = (await this.state.storage.get("pushSubscriptions")) || {};
    return this.pushSubscriptions;
  }

  async savePushSubscriptions() { await this.state.storage.put("pushSubscriptions", this.pushSubscriptions); }

  async loadHallOfFame() {
    if (this.hallOfFame === null) this.hallOfFame = (await this.state.storage.get("hallOfFame")) || [];
    return this.hallOfFame;
  }

  async saveHallOfFame() { await this.state.storage.put("hallOfFame", this.hallOfFame); }

  async loadResetSchedule() {
    if (this.resetSchedule === null) {
      this.resetSchedule = (await this.state.storage.get("resetSchedule")) || { enabled: false, nextResetAt: 0, intervalMs: 7 * 24 * 60 * 60 * 1000 };
    }
    return this.resetSchedule;
  }

  async saveResetSchedule() { await this.state.storage.put("resetSchedule", this.resetSchedule); }

  // ─── SCORE MANAGEMENT ────────────────────────────────────────────────────

  async renameScore(oldName, newName) {
    const scores = await this.loadScores();
    const oldKey = oldName.toLowerCase();
    const newKey = newName.toLowerCase();
    if (oldKey === newKey) return;
    const oldEntry = scores[oldKey];
    if (!oldEntry) return;
    const newEntry = scores[newKey];
    if (newEntry) {
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
    const serverEpoch = await this.loadScoreEpoch();
    if (serverEpoch > 0 && typeof clientEpoch === "number" && clientEpoch < serverEpoch) return;
    if (existing && existing.serverCutAt && (Date.now() - existing.serverCutAt) < 300000 && score > existing.score) {
      existing.stats = s;
      this.persistedScores = scores;
      await this.state.storage.put("scores", scores);
      return;
    }
    if (!existing || score > existing.score) {
      scores[key] = { name, score, stats: s, date: Date.now() };
    } else {
      existing.stats = s;
    }
    this.persistedScores = scores;
    await this.state.storage.put("scores", scores);
  }

  // ─── PUSH NOTIFICATIONS (Expo Push API) ──────────────────────────────────
  // Multi-tenant change: replaces VAPID Web Push with Expo Push Service.
  // Push tokens are Expo push tokens (ExponentPushToken[...]) stored per player.

  async sendPushToPlayer(name, title, body, category) {
    const subs = await this.loadPushSubscriptions();
    const key = name.toLowerCase();
    const playerTokens = subs[key];
    if (!playerTokens || playerTokens.length === 0) return;

    const messages = playerTokens.map(token => ({
      to: typeof token === "string" ? token : token.expoPushToken,
      title,
      body,
      data: { category },
      sound: "default",
    }));

    try {
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(messages),
      });
    } catch (e) {
      // Push failures are non-critical
    }
  }

  // ─── PLAYER MESSAGING ───────────────────────────────────────────────────

  sendToPlayer(name, data) {
    const msg = typeof data === "string" ? data : JSON.stringify(data);
    const lower = name.toLowerCase();
    for (const [ws, info] of this.connections) {
      if (info.name && info.name.toLowerCase() === lower) {
        try { ws.send(msg); } catch (e) {}
      }
    }
  }

  // ─── CHAT ────────────────────────────────────────────────────────────────

  filterProfanity(text) { return filterProfanity(text); }

  async addSystemChat(message) {
    await this.loadChat();
    const entry = { type: "system", message, timestamp: Date.now() };
    this.chatMessages.push(entry);
    if (this.chatMessages.length > 2000) this.chatMessages = this.chatMessages.slice(-2000);
    await this.saveChat();
    this.broadcastChat(entry);
  }

  broadcastChat(entry) {
    const msg = JSON.stringify({ ...entry, type: "chatMessage" });
    for (const [ws] of this.connections) {
      try { ws.send(msg); } catch (e) { this.connections.delete(ws); }
    }
  }

  // ─── BROADCAST ───────────────────────────────────────────────────────────

  async broadcast() {
    const scores = await this.loadScores();
    const sabotages = await this.loadSabotages();
    const credits = await this.loadCredits();
    const campaigns = await this.loadCampaigns();
    const epoch = await this.loadScoreEpoch();
    const hof = await this.loadHallOfFame();
    await this.checkAutoReset();

    // Build leaderboard from persisted scores + live connections
    const merged = {};
    for (const [key, val] of Object.entries(scores)) {
      merged[key] = { name: val.name, score: val.score, stats: val.stats || {} };
    }
    for (const [, info] of this.connections) {
      if (info.name) {
        const k = info.name.toLowerCase();
        const existing = merged[k];
        if (!existing || (info.score || 0) > existing.score) {
          merged[k] = { name: info.name, score: info.score || 0, stats: info.stats || {} };
        }
      }
    }

    const leaderboard = Object.values(merged)
      .filter(e => e.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 50);

    // Active sabotages (non-expired)
    const now = Date.now();
    const activeSabotages = sabotages.filter(s => s.expiresAt > now).map(s => ({
      targetName: s.targetName,
      attackerName: s.attackerName,
      expiresAt: s.expiresAt,
      freeze: s.freeze || false,
    }));

    // Active campaigns
    const activeCampaigns = Object.values(campaigns).filter(c => c.status === "active");

    // Active games summary
    const activeGamesList = [];
    for (const [, game] of this.activeGames) {
      if (!game._ended) {
        activeGamesList.push({
          id: game.id, type: game.type,
          player1: game.player1, player2: game.player2,
          wagerCoins: game.wagerCoins, createdAt: game.createdAt,
        });
      }
    }

    // Group lobbies
    const lobbies = [];
    for (const [, lobby] of this.groupLobbies) {
      if (lobby.status === "waiting") {
        lobbies.push({
          id: lobby.id, type: lobby.type, hostName: lobby.hostName,
          wagerCoins: lobby.wagerCoins, players: lobby.players,
          minPlayers: lobby.minPlayers, maxPlayers: lobby.maxPlayers,
        });
      }
    }

    // Online player list
    const online = new Set();
    for (const [, info] of this.connections) {
      if (info.name) online.add(info.name);
    }

    // Podium change detection
    const currentPodium = leaderboard.slice(0, 3).map(e => e.name);
    let podiumChange = null;
    if (this.lastPodium && this.lastPodium.length > 0) {
      for (let i = 0; i < 3; i++) {
        if (currentPodium[i] !== this.lastPodium[i]) {
          podiumChange = { position: i + 1, newName: currentPodium[i], oldName: this.lastPodium[i] };
          break;
        }
      }
    }
    // Send push notifications for podium changes
    if (podiumChange && podiumChange.oldName && podiumChange.newName !== podiumChange.oldName) {
      const pos = ["1st", "2nd", "3rd"][podiumChange.position - 1];
      this.sendPushToPlayer(podiumChange.oldName, "You've been passed!", podiumChange.newName + " took " + pos + " place!", "podium");
      this.sendPushToPlayer(podiumChange.newName, "You're " + pos + "!", "You moved up to " + pos + " place on the leaderboard!", "podium");
    }
    this.lastPodium = currentPodium;

    const resetSched = this.resetSchedule || {};
    const payload = JSON.stringify({
      type: "update",
      visitors: this.connections.size,
      online: Array.from(online),
      leaderboard,
      sabotages: activeSabotages,
      credits,
      campaigns: activeCampaigns,
      activeGames: activeGamesList,
      groupLobbies: lobbies,
      hallOfFame: hof,
      scoreEpoch: epoch,
      podiumChange,
      nextResetAt: resetSched.enabled ? resetSched.nextResetAt : null,
    });

    for (const [ws] of this.connections) {
      try { ws.send(payload); } catch (e) { this.connections.delete(ws); }
    }
  }

  // ─── AUTOCLICKER DETECTION ───────────────────────────────────────────────

  async checkAutoClickerAndBan(name, score, stats) {
    if (this.autobanEnabled === null) {
      this.autobanEnabled = (await this.state.storage.get("autobanEnabled"));
      if (this.autobanEnabled === undefined) this.autobanEnabled = true;
    }
    if (!this.autobanEnabled) return false;
    const key = name.toLowerCase();
    const banned = await this.loadBannedPlayers();
    if (banned[key]) return true;

    if (!this._scoreRateTracker[key]) {
      this._scoreRateTracker[key] = { updates: [], lastScore: score, lastTime: Date.now(), suspiciousCount: 0, initialized: false };
    }
    const tracker = this._scoreRateTracker[key];
    const now = Date.now();
    if (!tracker.initialized) {
      tracker.lastScore = score;
      tracker.lastTime = now;
      tracker.initialized = true;
      return false;
    }

    const timeDelta = (now - tracker.lastTime) / 1000;
    const scoreDelta = score - tracker.lastScore;
    tracker.lastScore = score;
    tracker.lastTime = now;
    if (timeDelta < 2) return false;

    const coinsPerClick = Math.max(1, (stats && stats.coinsPerClick) || 1);
    const coinsPerSec = (stats && stats.coinsPerSecond) || 0;
    const effectiveCPC = Math.max(coinsPerClick, tracker.lastCoinsPerClick || coinsPerClick);
    const effectiveCPS = Math.max(coinsPerSec, tracker.lastCoinsPerSecond || coinsPerSec);
    tracker.lastCoinsPerClick = coinsPerClick;
    tracker.lastCoinsPerSecond = coinsPerSec;

    const autoIncome = effectiveCPS * timeDelta * 1.2;
    const clickIncome = Math.max(0, scoreDelta - autoIncome);
    const impliedCPS = clickIncome / effectiveCPC / timeDelta;

    if (impliedCPS > 50) tracker.suspiciousCount++;
    else tracker.suspiciousCount = Math.max(0, tracker.suspiciousCount - 2);

    if (tracker.suspiciousCount >= 20) {
      const banDuration = 30 * 60 * 1000;
      banned[key] = { until: now + banDuration, reason: "Autoclicker detected (" + Math.round(impliedCPS) + " CPS sustained)", bannedAt: now, score };
      await this.saveBannedPlayers();
      tracker.suspiciousCount = 0;
      this.sendToPlayer(name, { type: "banned", until: banned[key].until, reason: banned[key].reason });
      this.sendPushToPlayer(name, "You've been banned", banned[key].reason || "Contact the admin for details", "admin");
      await this.addSystemChat("\u26D4 " + name + " has been temporarily banned for suspected autoclicking.");
      return true;
    }
    return false;
  }

  // ─── HALL OF FAME / AUTO RESET ───────────────────────────────────────────

  async snapshotWeeklyScores() {
    const scores = await this.loadScores();
    const leaderboard = Object.values(scores)
      .filter(e => e.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(e => ({ name: e.name, score: e.score }));
    if (leaderboard.length === 0) return;
    const hof = await this.loadHallOfFame();
    hof.push({
      week: hof.length + 1,
      date: new Date().toISOString().slice(0, 10),
      endedAt: Date.now(),
      top10: leaderboard,
      champion: leaderboard[0].name,
      championScore: leaderboard[0].score,
    });
    if (hof.length > 52) hof.splice(0, hof.length - 52);
    this.hallOfFame = hof;
    await this.saveHallOfFame();
  }

  getNextMonday(fromDate) {
    const d = new Date(fromDate || Date.now());
    d.setUTCHours(7, 0, 0, 0);
    const day = d.getUTCDay();
    const daysUntilMonday = (8 - day) % 7 || 7;
    d.setUTCDate(d.getUTCDate() + daysUntilMonday);
    return d.getTime();
  }

  async checkAutoReset() {
    const schedule = await this.loadResetSchedule();
    if (!schedule.enabled || !schedule.nextResetAt) return;
    if (Date.now() < schedule.nextResetAt) return;
    await this.performAutoReset();
    schedule.nextResetAt = this.getNextMonday(Date.now());
    await this.saveResetSchedule();
  }

  async performAutoReset() {
    await this.snapshotWeeklyScores();
    this.persistedScores = {};
    await this.state.storage.put("scores", {});
    const newEpoch = (await this.loadScoreEpoch()) + 1;
    this.scoreEpoch = newEpoch;
    await this.state.storage.put("scoreEpoch", newEpoch);
    for (const [, info] of this.connections) info.score = 0;
    const accounts = await this.loadAccounts();
    for (const key of Object.keys(accounts)) {
      if (accounts[key].gameState) { accounts[key].gameState = null; accounts[key].gameStateUpdatedAt = null; }
    }
    this.accounts = accounts;
    await this.saveAccounts();
    this.lastPodium = [];

    const config = await this.loadOrgConfig();
    const currency = config.currencyName || "coins";
    await this.addSystemChat("\uD83D\uDD04 WEEKLY RESET! All " + currency + " have been reset. New week, new competition!");
    const resetMsg = JSON.stringify({ type: "resetAll", scoreEpoch: newEpoch });
    for (const [ws] of this.connections) { try { ws.send(resetMsg); } catch (e) {} }
    this.broadcast();
  }

  // ─── ACCOUNT SYSTEM ─────────────────────────────────────────────────────

  async generateToken() {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
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

  // ─── BATTLE SYSTEM ──────────────────────────────────────────────────────

  async deductWager(name, amount) {
    const scores = await this.loadScores();
    const key = name.toLowerCase();
    const entry = scores[key];
    if (!entry || entry.score < amount) return false;
    entry.score -= amount;
    entry.serverCutAt = Date.now();
    this.persistedScores = scores;
    await this.state.storage.put("scores", scores);
    this.sendToPlayer(name, { type: "scoreCorrection", targetName: entry.name, newScore: entry.score, delta: -amount });
    return true;
  }

  async awardWinnings(name, amount) {
    const scores = await this.loadScores();
    const key = name.toLowerCase();
    const entry = scores[key];
    if (!entry) return;
    entry.score += amount;
    this.persistedScores = scores;
    await this.state.storage.put("scores", scores);
    this.sendToPlayer(name, { type: "scoreCorrection", targetName: entry.name, newScore: entry.score, delta: amount });
  }

  createGame(challenge) {
    // Use org-specific trivia if available (loaded from orgConfig.customTrivia)
    let TRIVIA_BANK = DEFAULT_TRIVIA_BANK;
    if (this.orgConfig?.customTrivia?.length >= 5) {
      TRIVIA_BANK = this.orgConfig.customTrivia;
    }
    const gameId = "g_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
    const game = {
      id: gameId, type: challenge.gameType,
      player1: challenge.challengerName, player2: challenge.targetName,
      wagerCoins: challenge.wagerCoins,
      p1Source: challenge.challengerSource || "score",
      p2Source: challenge.targetSource || "score",
      round: 1, maxRounds: 1, p1Score: 0, p2Score: 0,
      winner: null, createdAt: Date.now(),
      spectators: [], spectatorBets: [],
    };

    if (challenge.gameType === "rps") {
      game.rpsRound = { p1Move: null, p2Move: null };
      game.rpsResults = [];
    } else if (challenge.gameType === "coinflip") {
      game.coinFlipResult = Math.random() < 0.5 ? "heads" : "tails";
      game.winner = game.coinFlipResult === "heads" ? game.player1 : game.player2;
    } else if (challenge.gameType === "trivia") {
      const q = TRIVIA_BANK[Math.floor(Math.random() * TRIVIA_BANK.length)];
      const correctAnswer = q.a[q.c];
      const shuffled = q.a.slice();
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      game.triviaQuestion = q.q;
      game.triviaAnswers = shuffled;
      game.triviaCorrectIndex = shuffled.indexOf(correctAnswer);
      game.triviaP1Answer = null; game.triviaP1Time = null;
      game.triviaP2Answer = null; game.triviaP2Time = null;
      game.triviaStartedAt = Date.now();
    } else if (challenge.gameType === "ttt") {
      game.tttBoard = Array(9).fill(null);
      game.tttCurrentTurn = Math.random() < 0.5 ? game.player1 : game.player2;
      game.tttSymbols = { [game.player1]: "X", [game.player2]: "O" };
    } else if (challenge.gameType === "clickerduel") {
      game.cdDuration = 10000;
      game.cdStartAt = null;
      game.cdEndAt = null;
      game.cdP1Taps = 0;
      game.cdP2Taps = 0;
      game.cdCountdown = 3;
    } else if (challenge.gameType === "reaction") {
      game.reactionDelay = 2000 + Math.floor(Math.random() * 6000);
      game.reactionGoAt = Date.now() + game.reactionDelay;
      game.reactionP1Tap = null;
      game.reactionP2Tap = null;
      game.reactionP1FalseStart = false;
      game.reactionP2FalseStart = false;
    } else if (challenge.gameType === "hangman") {
      const word = HANGMAN_WORDS[Math.floor(Math.random() * HANGMAN_WORDS.length)];
      game.hangmanWord = word;
      game.hangmanP1Guesses = [];
      game.hangmanP2Guesses = [];
      game.hangmanP1Wrong = 0;
      game.hangmanP2Wrong = 0;
      game.hangmanMaxWrong = 6;
    } else if (challenge.gameType === "connect4") {
      game.c4Board = Array.from({ length: 7 }, () => Array(6).fill(null));
      game.c4CurrentTurn = Math.random() < 0.5 ? game.player1 : game.player2;
      game.c4Symbols = { [game.player1]: "R", [game.player2]: "Y" };
    } else if (challenge.gameType === "battleship") {
      game.bsSize = 8;
      game.bsShips = { p1: this.randomShipPlacement(8), p2: this.randomShipPlacement(8) };
      game.bsShots = { p1: [], p2: [] };
      game.bsCurrentTurn = Math.random() < 0.5 ? game.player1 : game.player2;
      game.bsSunk = { p1: 0, p2: 0 };
      game.bsTotalShips = Math.min(game.bsShips.p1.length, game.bsShips.p2.length);
      game.spectatorChat = [];
    }

    this.activeGames.set(gameId, game);
    return game;
  }

  resolveRps(p1, p2) {
    if (p1 === p2) return "draw";
    if ((p1 === "rock" && p2 === "scissors") || (p1 === "paper" && p2 === "rock") || (p1 === "scissors" && p2 === "paper")) return "p1";
    return "p2";
  }

  sanitizeGame(game, forPlayer) {
    const sanitized = { ...game };
    // Hide opponent's unrevealed moves
    if (game.type === "rps" && game.rpsRound) {
      const isP1 = forPlayer.toLowerCase() === game.player1.toLowerCase();
      sanitized.rpsRound = {
        p1Move: isP1 ? game.rpsRound.p1Move : (game.rpsRound.p1Move ? "chosen" : null),
        p2Move: isP1 ? (game.rpsRound.p2Move ? "chosen" : null) : game.rpsRound.p2Move,
      };
    }
    if (game.type === "battleship") {
      const isP1 = forPlayer ? forPlayer.toLowerCase() === game.player1.toLowerCase() : false;
      sanitized.bsShips = forPlayer ? { own: isP1 ? game.bsShips.p1 : game.bsShips.p2 } : {};
    }
    if (game.type === "hangman") {
      const word = game.hangmanWord || "";
      sanitized.hangmanWordLength = word.length;
      // Build masked words for each player
      sanitized.hangmanP1Masked = word.split("").map(l => game.hangmanP1Guesses?.includes(l) ? l : "_").join("");
      sanitized.hangmanP2Masked = word.split("").map(l => game.hangmanP2Guesses?.includes(l) ? l : "_").join("");
      // Reveal word only when game is over
      if (game.winner) {
        sanitized.hangmanWord = word;
      } else {
        delete sanitized.hangmanWord;
      }
    }
    return sanitized;
  }

  // sanitizeGroupGame is now defined in the group game section below

  randomShipPlacement(gridSize) {
    const sizes = [5, 4, 3, 3, 2];
    const ships = [];
    const occupied = new Set();
    for (const size of sizes) {
      let placed = false;
      for (let attempt = 0; attempt < 100 && !placed; attempt++) {
        const horizontal = Math.random() < 0.5;
        const x = Math.floor(Math.random() * (horizontal ? gridSize - size + 1 : gridSize));
        const y = Math.floor(Math.random() * (horizontal ? gridSize : gridSize - size + 1));
        const cells = [];
        let overlap = false;
        for (let i = 0; i < size; i++) {
          const cx = horizontal ? x + i : x;
          const cy = horizontal ? y : y + i;
          const key = cx + "," + cy;
          if (occupied.has(key)) { overlap = true; break; }
          cells.push({ x: cx, y: cy });
        }
        if (!overlap) {
          for (const cell of cells) occupied.add(cell.x + "," + cell.y);
          ships.push({ size, cells, hits: 0 });
          placed = true;
        }
      }
    }
    return ships;
  }

  async endGame(game, reason) {
    if (game._ended) return;
    game._ended = true;

    // Award winnings
    if (game.winner && game.winner !== "draw") {
      const loser = game.winner === game.player1 ? game.player2 : game.player1;
      const totalPot = game.wagerCoins * 2;
      await this.awardWinnings(game.winner, totalPot);
      await this.addSystemChat("\uD83C\uDFC6 " + game.winner + " beat " + loser + " and won " + totalPot + " coins!");
      this.sendPushToPlayer(game.winner, "You won!", totalPot + " coins from " + loser, "battle_win");
      this.sendPushToPlayer(loser, "You lost!", game.winner + " won " + totalPot + " coins", "battle_loss");
    } else if (game.winner === "draw") {
      // Refund wagers
      await this.awardWinnings(game.player1, game.wagerCoins);
      await this.awardWinnings(game.player2, game.wagerCoins);
      await this.addSystemChat("\uD83E\uDD1D " + game.player1 + " vs " + game.player2 + " — Draw! Wagers refunded.");
    }

    // Notify players
    this.sendToPlayer(game.player1, { type: "gameEnded", game: this.sanitizeGame(game, game.player1), reason });
    this.sendToPlayer(game.player2, { type: "gameEnded", game: this.sanitizeGame(game, game.player2), reason });

    // Clean up after a delay
    const self = this;
    setTimeout(() => { self.activeGames.delete(game.id); }, 30000);
    this.broadcast();
  }

  // ─── GROUP GAME SYSTEM ──────────────────────────────────────────────────

  createGroupLobby(hostName, gameType, wagerCoins, minPlayers, maxPlayers) {
    const lobbyId = "gl_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
    const lobby = {
      id: lobbyId, type: gameType, hostName, wagerCoins,
      minPlayers: minPlayers || 3, maxPlayers: maxPlayers || 20,
      players: [hostName], status: "waiting", createdAt: Date.now(),
    };
    this.groupLobbies.set(lobbyId, lobby);
    const self = this;
    setTimeout(() => {
      if (self.groupLobbies.has(lobbyId) && lobby.status === "waiting") {
        self.groupLobbies.delete(lobbyId);
        for (const p of lobby.players) self.sendToPlayer(p, { type: "groupLobbyExpired", lobbyId });
      }
    }, 300000);
    return lobby;
  }

  // ─── GROUP GAME TAP RATE DETECTION ────────────────────────────────────
  checkGameTapRate(playerName, gameId) {
    const key = playerName.toLowerCase() + ":" + gameId;
    if (!this._gameTapTracker) this._gameTapTracker = {};
    if (!this._gameTapTracker[key]) this._gameTapTracker[key] = { taps: [], flagged: false };
    const tracker = this._gameTapTracker[key];
    tracker.taps.push(Date.now());
    if (tracker.taps.length < 10) return false;
    if (tracker.taps.length > 20) tracker.taps = tracker.taps.slice(-20);
    const intervals = [];
    for (let i = 1; i < tracker.taps.length; i++) intervals.push(tracker.taps[i] - tracker.taps[i - 1]);
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    if (avgInterval < 40) { tracker.flagged = true; return true; }
    const variance = intervals.reduce((sum, v) => sum + (v - avgInterval) ** 2, 0) / intervals.length;
    const cv = avgInterval > 0 ? Math.sqrt(variance) / avgInterval : 0;
    if (cv < 0.05 && avgInterval < 150) { tracker.flagged = true; return true; }
    return false;
  }

  cleanupGameTapTracker(gameId) {
    if (!this._gameTapTracker) return;
    for (const key of Object.keys(this._gameTapTracker)) {
      if (key.includes(":" + gameId)) delete this._gameTapTracker[key];
    }
  }

  // ─── GROUP GAME CORE ────────────────────────────────────────────────
  broadcastGroupGame(game) {
    for (const p of game.players || []) {
      this.sendToPlayer(p, { type: "groupGameUpdate", game: this.sanitizeGroupGame(game, p) });
    }
    if (game.spectators) {
      for (const s of game.spectators) {
        this.sendToPlayer(s, { type: "groupGameUpdate", game: this.sanitizeGroupGame(game, null) });
      }
    }
  }

  sanitizeGroupGame(game, forPlayer) {
    const g = { ...game };
    if (game.type === "auction" && !game.revealed) {
      g.bids = {};
      if (forPlayer && game.bids?.[forPlayer] !== undefined) g.bids[forPlayer] = game.bids[forPlayer];
      g.bidCount = Object.keys(game.bids || {}).length;
    }
    if (game.type === "triviaroyale") {
      g.currentQ = game.questions?.[game.currentQuestion] || null;
      if (g.currentQ) g.currentQ = { q: g.currentQ.q, a: g.currentQ.a };
      g.questions = undefined;
      if (forPlayer) { g.myAnswer = game.answers?.[forPlayer] || null; g.answeredCount = Object.keys(game.answers || {}).length; }
      g.answers = undefined;
    }
    return g;
  }

  // ─── LAST CLICK STANDING ────────────────────────────────────────────
  startLastClickRound(game) {
    if (game.winner || game._ended) return;
    if (game.alive.length <= 1) { this.endGroupGame(game); return; }
    game.roundNumber++;
    game.roundClicks = {};
    for (const p of game.alive) game.roundClicks[p] = 0;
    game.roundStartAt = Date.now();
    game.roundEndAt = Date.now() + game.roundDuration;
    this.broadcastGroupGame(game);
    const self = this;
    setTimeout(() => self.endLastClickRound(game), game.roundDuration);
  }

  endLastClickRound(game) {
    if (game.winner || game._ended) return;
    let minClicks = Infinity, minPlayer = null;
    for (const p of game.alive) {
      const c = game.roundClicks[p] || 0;
      if (c < minClicks) { minClicks = c; minPlayer = p; }
    }
    if (minPlayer) {
      game.eliminated.push({ name: minPlayer, round: game.roundNumber, clicks: minClicks });
      game.alive = game.alive.filter(p => p !== minPlayer);
    }
    game.roundStartAt = null;
    if (game.alive.length <= 1) {
      game.winner = game.alive.length === 1 ? game.alive[0] : "draw";
      this.endGroupGame(game);
    } else {
      this.broadcastGroupGame(game);
      const self = this;
      setTimeout(() => self.startLastClickRound(game), 3000);
    }
  }

  // ─── AUCTION HOUSE ──────────────────────────────────────────────────
  async resolveAuction(game) {
    if (game.winner || game._ended || game.revealed) return;
    game.revealed = true;
    let highBid = 0, highBidder = null;
    for (const p in game.bids) {
      if (game.bids[p] > highBid) { highBid = game.bids[p]; highBidder = p; }
    }
    if (highBidder) {
      game.winner = highBidder;
      game.winningBid = highBid;
      await this.awardWinnings(highBidder, game.prizeAmount);
      for (const p of game.players) {
        if (p !== highBidder) await this.awardWinnings(p, game.wagerCoins);
      }
    } else {
      game.winner = "draw";
      for (const p of game.players) await this.awardWinnings(p, game.wagerCoins);
    }
    this.broadcastGroupGame(game);
    await this.endGroupGame(game);
  }

  // ─── TRIVIA ROYALE ─────────────────────────────────────────────────
  startTriviaRoyaleRound(game) {
    if (game.winner || game._ended) return;
    if (game.alive.length <= 0 || game.currentQuestion >= game.questions.length) {
      if (game.alive.length === 1) game.winner = game.alive[0];
      else if (game.alive.length > 1) {
        let fastest = null, ft = Infinity;
        for (const p of game.alive) {
          const t = game.cumulativeTimes[p] || 999999;
          if (t < ft) { ft = t; fastest = p; }
        }
        game.winner = fastest || "draw";
      } else game.winner = "draw";
      this.endGroupGame(game);
      return;
    }
    game.answers = {};
    game.questionStartAt = Date.now();
    this.broadcastGroupGame(game);
    const self = this;
    setTimeout(() => self.endTriviaRoyaleRound(game), 15000);
  }

  endTriviaRoyaleRound(game) {
    if (game.winner || game._ended) return;
    const q = game.questions[game.currentQuestion];
    const newAlive = [];
    for (const p of game.alive) {
      const ans = game.answers[p];
      if (ans && ans.answer === q.correct) {
        newAlive.push(p);
        game.cumulativeTimes[p] = (game.cumulativeTimes[p] || 0) + ans.time;
      } else {
        game.eliminated.push({ name: p, round: game.currentQuestion + 1 });
      }
    }
    game.alive = newAlive;
    game.currentQuestion++;
    this.broadcastGroupGame(game);
    const self = this;
    setTimeout(() => self.startTriviaRoyaleRound(game), 3000);
  }

  // ─── GROUP MOVE PROCESSING ──────────────────────────────────────────
  processGroupMove(game, playerName, move) {
    if (game._ended || game.winner) return;
    if (game.type === "lastclick") {
      if (move !== "tap" || !game.roundStartAt || Date.now() > game.roundEndAt || !game.alive.includes(playerName)) return;
      if (this.checkGameTapRate(playerName, game.id)) return;
      game.roundClicks[playerName] = (game.roundClicks[playerName] || 0) + 1;
    } else if (game.type === "auction") {
      if (game.revealed || !game.players.includes(playerName)) return;
      const bid = parseInt(move);
      if (isNaN(bid) || bid < 0) return;
      game.bids[playerName] = Math.min(bid, game.wagerCoins * 10);
      this.sendToPlayer(playerName, { type: "groupGameUpdate", game: this.sanitizeGroupGame(game, playerName) });
    } else if (game.type === "triviaroyale") {
      if (!game.alive.includes(playerName) || game.answers[playerName]) return;
      const idx = parseInt(move);
      if (isNaN(idx) || idx < 0 || idx > 3) return;
      game.answers[playerName] = { answer: idx, time: Date.now() - game.questionStartAt };
      if (game.alive.every(p => !!game.answers[p])) this.endTriviaRoyaleRound(game);
      else this.broadcastGroupGame(game);
    }
  }

  // ─── SPECTATOR BETS ─────────────────────────────────────────────────
  async resolveSpectatorBets(game) {
    if (!game.spectatorBets || game.spectatorBets.length === 0) return;
    if (!game.winner || game.winner === "draw") {
      for (const bet of game.spectatorBets) await this.awardWinnings(bet.name, bet.amount);
      return;
    }
    const winners = game.spectatorBets.filter(b => b.betOn.toLowerCase() === game.winner.toLowerCase());
    const totalPool = game.spectatorBets.reduce((s, b) => s + b.amount, 0);
    const winnerPool = winners.reduce((s, b) => s + b.amount, 0);
    if (winnerPool === 0) {
      for (const bet of game.spectatorBets) await this.awardWinnings(bet.name, bet.amount);
      return;
    }
    for (const bet of winners) {
      const payout = Math.floor(totalPool * (bet.amount / winnerPool));
      if (payout > 0) await this.awardWinnings(bet.name, payout);
      this.sendToPlayer(bet.name, { type: "spectatorBetResult", won: true, payout, gameId: game.id });
      this.sendPushToPlayer(bet.name, "Bet won!", "+" + payout + " coins from spectator bet!", "battle_win");
    }
    for (const bet of game.spectatorBets.filter(b => b.betOn.toLowerCase() !== game.winner.toLowerCase())) {
      this.sendToPlayer(bet.name, { type: "spectatorBetResult", won: false, payout: 0, gameId: game.id });
      this.sendPushToPlayer(bet.name, "Bet lost", "Your spectator bet of " + bet.amount + " coins didn't pay out", "battle_loss");
    }
  }

  // ─── END GROUP GAME ─────────────────────────────────────────────────
  async endGroupGame(game) {
    if (game._ended) return;
    game._ended = true;
    const tn = { lastclick: "Last Click Standing", auction: "Auction House", triviaroyale: "Trivia Royale" };
    const gameName = tn[game.type] || game.type;
    if (game.winner && game.winner !== "draw") {
      await this.awardWinnings(game.winner, game.pot);
      await this.addSystemChat("\uD83C\uDFC6 " + game.winner + " wins " + gameName + "! +" + game.pot + " coins!");
      // Push: notify winner and losers
      this.sendPushToPlayer(game.winner, "You won " + gameName + "!", "+" + game.pot + " coins!", "battle_win");
      for (const p of game.players) {
        if (p.toLowerCase() !== game.winner.toLowerCase()) {
          this.sendPushToPlayer(p, gameName + " over", game.winner + " won the pot of " + game.pot + " coins", "battle_loss");
        }
      }
    } else if (game.winner === "draw") {
      const share = Math.floor(game.pot / game.players.length);
      for (const p of game.players) {
        await this.awardWinnings(p, share);
        this.sendPushToPlayer(p, gameName + " — Draw!", "Pot split: +" + share + " coins each", "battle_win");
      }
    }
    this.broadcastGroupGame(game);
    await this.resolveSpectatorBets(game);
    this.cleanupGameTapTracker(game.id);
    for (const p of game.players) {
      this.sendToPlayer(p, { type: "groupGameEnded", game: this.sanitizeGroupGame(game, p) });
    }
    const self = this;
    setTimeout(() => { self.activeGames.delete(game.id); self.groupLobbies.delete(game.id); }, 60000);
    this.broadcast();
  }

  // ─── FETCH HANDLER (HTTP + WebSocket) ────────────────────────────────────
  // Handles both internal fetch calls from the router and WebSocket upgrades.

  async fetch(request) {
    const url = new URL(request.url);
    const internalRequest = this.isInternalRequest(request);

    // ── Update org config (called by router when admin updates config)
    if (url.pathname === "/update-config" && request.method === "POST") {
      if (!internalRequest) return this.jsonError("Unauthorized");
      const config = await request.json();
      await this.saveOrgConfig(config);
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }

    // ── Credits API
    if (url.pathname === "/credits/get" && request.method === "POST") {
      const auth = await this.authorizePlayerRequest(request);
      if (!auth) return this.jsonError("Unauthorized");
      const credits = await this.loadCredits();
      return new Response(JSON.stringify({ credits: credits[auth.displayName.toLowerCase()] || 0 }), { headers: { "Content-Type": "application/json" } });
    }

    if (url.pathname === "/credits/add" && request.method === "POST") {
      if (!internalRequest) return this.jsonError("Unauthorized");
      const body = await request.json();
      const playerName = String(body.playerName || "").slice(0, 20);
      const count = Math.floor(Number(body.count) || 0);
      const paymentIntentId = String(body.paymentIntentId || "").trim();
      if (!playerName || count <= 0) return new Response(JSON.stringify({ error: "playerName and positive count required" }), { status: 400 });
      await this.runPaymentFulfillment(paymentIntentId, async () => {
        await this.addCredits(playerName, count);
        return { playerName, count };
      });
      this.broadcast();
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }

    // ── Admin: reset all scores
    if (url.pathname === "/admin/reset-scores" && request.method === "POST") {
      this.persistedScores = {};
      await this.state.storage.put("scores", {});
      const newEpoch = (await this.loadScoreEpoch()) + 1;
      this.scoreEpoch = newEpoch;
      await this.state.storage.put("scoreEpoch", newEpoch);
      for (const [, info] of this.connections) info.score = 0;
      const accounts = await this.loadAccounts();
      for (const key of Object.keys(accounts)) {
        if (accounts[key].gameState) { accounts[key].gameState = null; accounts[key].gameStateUpdatedAt = null; }
      }
      this.accounts = accounts;
      await this.saveAccounts();
      this.lastPodium = [];
      await this.addSystemChat("ADMIN reset all scores!");
      const resetMsg = JSON.stringify({ type: "resetAll", scoreEpoch: newEpoch });
      for (const [ws] of this.connections) { try { ws.send(resetMsg); } catch (e) {} }
      this.broadcast();
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }

    // ── Admin: reset individual player
    if (url.pathname === "/admin/reset-player" && request.method === "POST") {
      const body = await request.json();
      const targetName = String(body.playerName || "").trim();
      if (!targetName) return new Response(JSON.stringify({ error: "playerName required" }), { status: 400, headers: { "Content-Type": "application/json" } });
      const targetKey = targetName.toLowerCase();
      const scores = await this.loadScores();
      if (scores[targetKey]) {
        scores[targetKey].score = 0;
        scores[targetKey].serverCutAt = Date.now();
        scores[targetKey].stats = {};
      }
      this.persistedScores = scores;
      await this.state.storage.put("scores", scores);
      const svrEpoch = await this.loadScoreEpoch();
      const msg = JSON.stringify({ type: "resetAll", scoreEpoch: svrEpoch });
      for (const [ws, info] of this.connections) {
        if (info.name && info.name.toLowerCase() === targetKey) {
          info.score = 0; info.stats = {};
          try { ws.send(msg); } catch (e) {}
        }
      }
      await this.addSystemChat("ADMIN reset " + targetName + "'s score!");
      this.broadcast();
      return new Response(JSON.stringify({ ok: true, player: targetName }), { headers: { "Content-Type": "application/json" } });
    }

    // ── Admin: add coins
    if (url.pathname === "/admin/add-coins" && request.method === "POST") {
      const body = await request.json();
      const targetName = String(body.playerName || "").trim();
      const amount = Math.floor(Number(body.amount) || 0);
      if (!targetName || amount <= 0) return new Response(JSON.stringify({ error: "playerName and positive amount required" }), { status: 400 });
      const targetKey = targetName.toLowerCase();
      const scores = await this.loadScores();
      if (scores[targetKey]) scores[targetKey].score += amount;
      else scores[targetKey] = { name: targetName, score: amount, stats: {}, date: Date.now() };
      this.persistedScores = scores;
      await this.state.storage.put("scores", scores);
      const correctionMsg = JSON.stringify({ type: "scoreCorrection", targetName, newScore: scores[targetKey].score, delta: amount });
      for (const [ws, info] of this.connections) {
        if (info.name && info.name.toLowerCase() === targetKey) {
          info.score = scores[targetKey].score;
          try { ws.send(correctionMsg); } catch (e) {}
        }
      }
      await this.addSystemChat("ADMIN gave " + targetName + " " + amount.toLocaleString() + " coins!");
      this.broadcast();
      return new Response(JSON.stringify({ ok: true, player: targetName, newScore: scores[targetKey].score }), { headers: { "Content-Type": "application/json" } });
    }

    // ── Admin: banned players
    if (url.pathname === "/admin/banned" && request.method === "GET") {
      return new Response(JSON.stringify(await this.loadBannedPlayers()), { headers: { "Content-Type": "application/json" } });
    }

    if (url.pathname === "/admin/unban" && request.method === "POST") {
      const body = await request.json();
      const name = String(body.playerName || "").toLowerCase();
      const banned = await this.loadBannedPlayers();
      if (banned[name]) {
        delete banned[name];
        this.bannedPlayers = banned;
        await this.saveBannedPlayers();
        delete this._scoreRateTracker[name];
        await this.addSystemChat("\u2705 " + body.playerName + " has been unbanned by admin.");
        this.sendToPlayer(body.playerName, { type: "unbanned" });
        return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: "Not banned" }), { status: 404, headers: { "Content-Type": "application/json" } });
    }

    // ── Admin: live stats (connections, leaderboard, sabotages)
    if (url.pathname === "/admin/stats" && request.method === "GET") {
      const scores = await this.loadScores();
      const sorted = Object.values(scores).sort((a, b) => b.score - a.score);
      const sabotages = await this.state.storage.get("sabotages") || [];
      const activeSabotages = sabotages.filter(s => s.expiresAt > Date.now());
      return new Response(JSON.stringify({
        connectedPlayers: this.connections.size,
        scoreEpoch: await this.loadScoreEpoch(),
        totalPlayers: sorted.length,
        topScores: sorted.slice(0, 50).map(s => ({ name: s.name, score: s.score })),
        activeSabotages: activeSabotages.map(s => ({ type: s.type, target: s.targetName, by: s.buyerName, expiresAt: s.expiresAt })),
      }), { headers: { "Content-Type": "application/json" } });
    }

    // ── Admin: autoban toggle
    if (url.pathname === "/admin/autoban" && request.method === "GET") {
      if (this.autobanEnabled === null) {
        this.autobanEnabled = (await this.state.storage.get("autobanEnabled"));
        if (this.autobanEnabled === undefined) this.autobanEnabled = true;
      }
      return new Response(JSON.stringify({ enabled: this.autobanEnabled }), { headers: { "Content-Type": "application/json" } });
    }

    if (url.pathname === "/admin/autoban" && request.method === "POST") {
      const body = await request.json();
      this.autobanEnabled = !!body.enabled;
      await this.state.storage.put("autobanEnabled", this.autobanEnabled);
      return new Response(JSON.stringify({ enabled: this.autobanEnabled }), { headers: { "Content-Type": "application/json" } });
    }

    // ── Admin: reset schedule
    if (url.pathname === "/admin/reset-schedule" && request.method === "GET") {
      return new Response(JSON.stringify(await this.loadResetSchedule()), { headers: { "Content-Type": "application/json" } });
    }

    if (url.pathname === "/admin/reset-schedule" && request.method === "POST") {
      const body = await request.json();
      const sched = await this.loadResetSchedule();
      if (typeof body.enabled === "boolean") sched.enabled = body.enabled;
      if (sched.enabled && (!sched.nextResetAt || sched.nextResetAt < Date.now())) {
        sched.nextResetAt = this.getNextMonday(Date.now());
      }
      this.resetSchedule = sched;
      await this.saveResetSchedule();
      return new Response(JSON.stringify(sched), { headers: { "Content-Type": "application/json" } });
    }

    // ── Admin: delete score (remove player from leaderboard entirely)
    if (url.pathname === "/admin/delete-score" && request.method === "POST") {
      const body = await request.json();
      const targetName = String(body.playerName || "").trim();
      if (!targetName) return new Response(JSON.stringify({ error: "playerName required" }), { status: 400, headers: { "Content-Type": "application/json" } });
      const targetKey = targetName.toLowerCase();
      const scores = await this.loadScores();
      if (scores[targetKey]) {
        delete scores[targetKey];
        this.persistedScores = scores;
        await this.state.storage.put("scores", scores);
        await this.addSystemChat("ADMIN removed " + targetName + " from leaderboard.");
        this.broadcast();
        return new Response(JSON.stringify({ ok: true, deleted: targetName }), { headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: "Player not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
    }

    // ── Admin: list active campaigns
    if (url.pathname === "/admin/campaigns" && request.method === "GET") {
      const campaigns = await this.loadCampaigns();
      const active = Object.entries(campaigns).filter(([, c]) => c.status === "active").map(([id, c]) => ({ id, ...c }));
      return new Response(JSON.stringify({ campaigns: active }), { headers: { "Content-Type": "application/json" } });
    }

    // ── Admin: cancel campaign
    if (url.pathname === "/admin/cancel-campaign" && request.method === "POST") {
      const body = await request.json();
      const campaignId = String(body.campaignId || "");
      if (!campaignId) return new Response(JSON.stringify({ error: "campaignId required" }), { status: 400, headers: { "Content-Type": "application/json" } });
      const campaigns = await this.loadCampaigns();
      if (campaigns[campaignId] && campaigns[campaignId].status === "active") {
        campaigns[campaignId].status = "cancelled";
        campaigns[campaignId].cancelledBy = "ADMIN";
        this.campaigns = campaigns;
        await this.saveCampaigns();
        await this.addSystemChat("ADMIN cancelled campaign against " + (campaigns[campaignId].targetName || "unknown") + ".");
        const msg = JSON.stringify({ type: "campaignCancelled", campaignId, reason: "admin" });
        for (const [ws] of this.connections) { try { ws.send(msg); } catch (e) {} }
        this.broadcast();
        return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: "Campaign not found or not active" }), { status: 404, headers: { "Content-Type": "application/json" } });
    }

    // ── Admin: hide luke/photos for a player
    if (url.pathname === "/admin/hide-luke" && request.method === "POST") {
      const body = await request.json();
      const playerName = String(body.playerName || "").trim();
      const durationMs = Math.max(60000, Math.min(86400000, (Number(body.durationMinutes) || 60) * 60000));
      if (!playerName) return new Response(JSON.stringify({ error: "playerName required" }), { status: 400, headers: { "Content-Type": "application/json" } });
      const key = playerName.toLowerCase();
      const hiddenUntil = Date.now() + durationMs;
      // Store in DO state
      const lukeHidden = (await this.state.storage.get("lukeHidden")) || {};
      lukeHidden[key] = { playerName, hiddenUntil };
      await this.state.storage.put("lukeHidden", lukeHidden);
      // Notify the player via WS
      this.sendToPlayer(playerName, { type: "lukeHidden", hiddenUntil });
      return new Response(JSON.stringify({ ok: true, playerName, expiresAt: hiddenUntil }), { headers: { "Content-Type": "application/json" } });
    }

    if (url.pathname === "/account/me" && request.method === "GET") {
      const auth = await this.authorizePlayerRequest(request);
      if (!auth) return this.jsonError("Unauthorized");
      return new Response(JSON.stringify({
        ok: true,
        displayName: auth.displayName,
      }), { headers: { "Content-Type": "application/json" } });
    }

    // ── Admin: create test players (for testing battles/games)
    if (url.pathname === "/admin/test-players" && request.method === "POST") {
      const body = await request.json();
      const count = Math.min(Number(body.count) || 3, 10);
      const names = ["TestBot_Alpha", "TestBot_Beta", "TestBot_Gamma", "TestBot_Delta", "TestBot_Echo", "TestBot_Foxtrot", "TestBot_Golf", "TestBot_Hotel", "TestBot_India", "TestBot_Juliet"];
      const accounts = await this.loadAccounts();
      const scores = await this.loadScores();
      const created = [];
      for (let i = 0; i < count; i++) {
        const name = names[i];
        const key = name.toLowerCase();
        if (!accounts[key]) {
          const token = await this.generateToken();
          accounts[key] = { displayName: name, pinHash: "test", tokens: [token], createdAt: Date.now(), isTestBot: true };
          const baseScore = Math.floor(1000 + Math.random() * 100000);
          scores[key] = { name, score: baseScore, stats: { coinsPerClick: 1, coinsPerSecond: Math.floor(Math.random() * 10), totalClicks: Math.floor(baseScore / 3), sightings: Math.floor(Math.random() * 20) }, date: Date.now() };
          created.push({ name, score: baseScore, token });
        } else {
          created.push({ name, score: scores[key]?.score || 0, token: accounts[key].tokens?.[0] || "existing" });
        }
      }
      this.accounts = accounts;
      await this.saveAccounts();
      this.persistedScores = scores;
      await this.state.storage.put("scores", scores);
      this.broadcast();
      return new Response(JSON.stringify({ ok: true, created }), { headers: { "Content-Type": "application/json" } });
    }

    // ── Account: register
    if (url.pathname === "/account/register" && request.method === "POST") {
      const body = await request.json();
      const name = String(body.name || "").slice(0, 20).trim();
      const pin = String(body.pin || "").trim();
      if (!name || pin.length < 4) return new Response(JSON.stringify({ error: "Name and PIN (4+ digits) required" }), { status: 400 });
      const accounts = await this.loadAccounts();
      const key = name.toLowerCase();
      if (accounts[key]) return new Response(JSON.stringify({ error: "Account already exists. Please log in instead." }), { status: 409 });
      const pinHash = await hashPassword(pin);
      const token = await this.generateToken();
      accounts[key] = { displayName: name, pinHash, tokens: [token], createdAt: Date.now() };
      this.accounts = accounts;
      await this.saveAccounts();
      const scores = await this.loadScores();
      return new Response(JSON.stringify({ ok: true, token, displayName: name, score: scores[key] ? scores[key].score : 0 }), { headers: { "Content-Type": "application/json" } });
    }

    // ── Account: login (with rate limiting)
    if (url.pathname === "/account/login" && request.method === "POST") {
      const body = await request.json();
      const name = String(body.name || "").slice(0, 20).trim();
      const pin = String(body.pin || "").trim();
      if (!name || !pin) return new Response(JSON.stringify({ error: "Name and PIN required" }), { status: 400 });

      // Rate limiting: max 5 failed attempts per name per 15 minutes
      const key = name.toLowerCase();
      if (!this._loginAttempts) this._loginAttempts = {};
      const attempts = this._loginAttempts[key];
      if (attempts) {
        // Clean old attempts
        const cutoff = Date.now() - 15 * 60 * 1000;
        attempts.times = attempts.times.filter(t => t > cutoff);
        if (attempts.times.length >= 5) {
          const retryAfter = Math.ceil((attempts.times[0] + 15 * 60 * 1000 - Date.now()) / 1000);
          return new Response(JSON.stringify({
            error: "Too many failed attempts. Try again in " + Math.ceil(retryAfter / 60) + " minutes.",
          }), { status: 429, headers: { "Content-Type": "application/json", "Retry-After": String(retryAfter) } });
        }
      }

      const accounts = await this.loadAccounts();
      const account = accounts[key];
      if (!account) return new Response(JSON.stringify({ error: "No account found. Register first!" }), { status: 404 });
      const pinValid = await verifyPassword(pin, account.pinHash);
      if (!pinValid) {
        // Track failed attempt
        if (!this._loginAttempts[key]) this._loginAttempts[key] = { times: [] };
        this._loginAttempts[key].times.push(Date.now());
        const remaining = 5 - this._loginAttempts[key].times.length;
        return new Response(JSON.stringify({
          error: "Incorrect PIN" + (remaining <= 2 ? `. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining.` : ""),
        }), { status: 401, headers: { "Content-Type": "application/json" } });
      }
      // Success — clear failed attempts
      delete this._loginAttempts[key];
      if (needsPasswordRehash(account.pinHash)) {
        account.pinHash = await hashPassword(pin);
      }
      const token = await this.generateToken();
      account.tokens = account.tokens || [];
      account.tokens.push(token);
      if (account.tokens.length > 10) account.tokens = account.tokens.slice(-10);
      await this.saveAccounts();
      const scores = await this.loadScores();
      const entry = scores[key];
      return new Response(JSON.stringify({ ok: true, token, displayName: account.displayName, score: entry ? entry.score : 0, stats: entry ? entry.stats : null, gameState: account.gameState || null }), { headers: { "Content-Type": "application/json" } });
    }

    // ── Account: logout
    if (url.pathname === "/account/logout" && request.method === "POST") {
      const body = await request.json();
      const token = String(body.token || extractBearerToken(request) || "");
      if (token) {
        const found = await this.findAccountByToken(token);
        if (found) {
          found.account.tokens = found.account.tokens.filter(t => t !== token);
          await this.saveAccounts();
        }
      }
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }

    // ── Admin freeze (sabotage initiated by admin)
    if (url.pathname === "/freeze" && request.method === "POST") {
      const body = await request.json();
      const attackerName = String(body.attackerName || "ADMIN").slice(0, 20);
      const targetName = String(body.targetName || "").slice(0, 20);
      const durationMin = Math.max(1, Math.min(360, Number(body.durationMin) || 5));
      if (!targetName) return new Response(JSON.stringify({ error: "targetName required" }), { status: 400, headers: { "Content-Type": "application/json" } });
      const durationMs = durationMin * 60 * 1000;
      await this.loadSabotages();
      const expiresAt = Date.now() + durationMs;
      this.sabotages.push({ targetName, attackerName, expiresAt, freeze: true });
      await this.saveSabotages();
      await this.addSystemChat(attackerName + " froze " + targetName + " for " + durationMin + " minutes!");
      this.sendToPlayer(targetName, { type: "sabotaged", attackerName, expiresAt });
      this.broadcast();
      return new Response(JSON.stringify({ ok: true, targetName, durationMin }), { headers: { "Content-Type": "application/json" } });
    }

    // ── Sabotage: unsabotage
    if (url.pathname === "/unsabotage" && request.method === "POST") {
      if (!internalRequest) return this.jsonError("Unauthorized");
      const body = await request.json();
      const targetName = String(body.targetName || "").slice(0, 20);
      const paymentIntentId = String(body.paymentIntentId || "").trim();
      if (!targetName) return new Response(JSON.stringify({ error: "targetName required" }), { status: 400 });
      await this.runPaymentFulfillment(paymentIntentId, async () => {
        await this.removeSabotage(targetName);
        return { targetName };
      });
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }

    // ── Coin Cut
    if (url.pathname === "/coincut" && request.method === "POST") {
      if (!internalRequest) return this.jsonError("Unauthorized");
      const body = await request.json();
      const attackerName = String(body.attackerName || "").slice(0, 20);
      const targetName = String(body.targetName || "").slice(0, 20);
      const percentage = Math.floor(Number(body.percentage) || 0);
      const paymentIntentId = String(body.paymentIntentId || "").trim();
      const allowedPcts = [1, 5, 10, 15, 20, 25, 30, 35, 40];
      if (!attackerName || !targetName) return new Response(JSON.stringify({ error: "attackerName and targetName required" }), { status: 400 });
      if (!allowedPcts.includes(percentage)) return new Response(JSON.stringify({ error: "Invalid percentage" }), { status: 400 });
      await this.runPaymentFulfillment(paymentIntentId, async () => {
        const scores = await this.loadScores();
        const targetKey = targetName.toLowerCase();
        if (!scores[targetKey]) {
          throw new Error("Target not found");
        }
        const oldScore = scores[targetKey].score;
        const removed = Math.floor(oldScore * (percentage / 100));
        scores[targetKey].score = oldScore - removed;
        scores[targetKey].serverCutAt = Date.now();
        this.persistedScores = scores;
        await this.state.storage.put("scores", scores);
        await this.addSystemChat(attackerName + " cut " + targetName + "'s coins by " + percentage + "%! Lost " + removed.toLocaleString() + " coins!");
        const cutEvent = JSON.stringify({ type: "coinCutEvent", attackerName, targetName, percentage, removed, newScore: scores[targetKey].score, timestamp: Date.now() });
        const correctionMsg = JSON.stringify({ type: "scoreCorrection", targetName, newScore: scores[targetKey].score, delta: -removed });
        for (const [ws] of this.connections) {
          try { ws.send(cutEvent); ws.send(correctionMsg); } catch (e) { this.connections.delete(ws); }
        }
        this.sendPushToPlayer(targetName, attackerName + " cut your coins by " + percentage + "%!", "You lost " + removed.toLocaleString() + " coins!", "coincut");
        return { attackerName, targetName, percentage, removed };
      });
      this.broadcast();
      const scores = await this.loadScores();
      return new Response(JSON.stringify({ ok: true, newScore: scores[targetName.toLowerCase()]?.score || 0 }), { headers: { "Content-Type": "application/json" } });
    }

    // ── Campaign: create a new crowdfunded coin cut campaign
    if (url.pathname === "/campaign/create" && request.method === "POST") {
      const body = await request.json();
      const creatorName = String(body.creatorName || "").slice(0, 20);
      const targetName = String(body.targetName || "").slice(0, 20);
      const type = body.type === "wipe" ? "wipe" : "cut";
      const percentage = type === "cut" ? Math.min(40, Math.max(10, Number(body.percentage) || 20)) : 100;
      // Pricing: $1 per 10% for cuts, $10 for a total wipe (in cents)
      const totalPriceCents = type === "wipe" ? 1000 : Math.ceil(percentage / 10) * 100;
      if (!creatorName || !targetName) return this.jsonError("creatorName and targetName required");
      const campaigns = await this.loadCampaigns();
      // Don't allow duplicate active campaigns against same target
      const existing = Object.values(campaigns).find(c => c.status === "active" && c.targetName.toLowerCase() === targetName.toLowerCase());
      if (existing) return new Response(JSON.stringify({ error: "Active campaign already exists against this player" }), { status: 400, headers: { "Content-Type": "application/json" } });
      const campaignId = "camp_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
      campaigns[campaignId] = {
        id: campaignId, type, percentage, targetName, creatorName,
        totalPriceCents, contributedCents: 0, contributors: [],
        status: "active", createdAt: Date.now(),
      };
      this.campaigns = campaigns;
      await this.saveCampaigns();
      await this.addSystemChat("\uD83D\uDCE2 " + creatorName + " started a " + (type === "wipe" ? "Total Wipe" : percentage + "% Coin Cut") + " campaign against " + targetName + "!");
      this.broadcast();
      return new Response(JSON.stringify({ ok: true, campaignId, campaign: campaigns[campaignId] }), { headers: { "Content-Type": "application/json" } });
    }

    // ── Campaign: contribute to an existing campaign (called by payment fulfillment)
    if (url.pathname === "/campaign/contribute" && request.method === "POST") {
      const body = await request.json();
      const campaignId = String(body.campaignId || "");
      const contributorName = String(body.contributorName || "").slice(0, 20);
      const cents = Math.max(0, Number(body.cents) || 0);
      const paymentIntentId = String(body.paymentIntentId || "").trim();
      if (!campaignId || !contributorName || cents <= 0) {
        return new Response(JSON.stringify({ error: "campaignId, contributorName, and cents required" }), { status: 400, headers: { "Content-Type": "application/json" } });
      }
      const campaigns = await this.loadCampaigns();
      const campaign = campaigns[campaignId];
      if (!campaign || campaign.status !== "active") {
        return new Response(JSON.stringify({ error: "Campaign not found or not active" }), { status: 404, headers: { "Content-Type": "application/json" } });
      }
      // Record contribution
      campaign.contributedCents += cents;
      if (!campaign.contributors.some(c => c.name?.toLowerCase() === contributorName.toLowerCase())) {
        campaign.contributors.push({ name: contributorName, cents, at: Date.now() });
      } else {
        const c = campaign.contributors.find(c => c.name?.toLowerCase() === contributorName.toLowerCase());
        if (c) c.cents = (c.cents || 0) + cents;
      }
      await this.addSystemChat("\uD83D\uDCB0 " + contributorName + " contributed " + (cents / 100).toFixed(2) + " to the campaign against " + campaign.targetName + "! (" + Math.round((campaign.contributedCents / campaign.totalPriceCents) * 100) + "% funded)");
      // Check if fully funded — execute the campaign
      if (campaign.contributedCents >= campaign.totalPriceCents) {
        campaign.status = "completed";
        const scores = await this.loadScores();
        const targetKey = campaign.targetName.toLowerCase();
        if (scores[targetKey]) {
          const oldScore = scores[targetKey].score;
          const removed = campaign.type === "wipe" ? oldScore : Math.floor(oldScore * (campaign.percentage / 100));
          scores[targetKey].score = Math.max(0, oldScore - removed);
          scores[targetKey].serverCutAt = Date.now();
          this.persistedScores = scores;
          await this.state.storage.put("scores", scores);
          const emoji = campaign.type === "wipe" ? "\uD83D\uDCA5" : "\u2702\uFE0F";
          await this.addSystemChat(emoji + " Campaign complete! " + campaign.targetName + " lost " + removed.toLocaleString() + " coins" + (campaign.type === "wipe" ? " (TOTAL WIPE)" : " (" + campaign.percentage + "% cut)") + "!");
          const cutEvent = JSON.stringify({ type: "coinCutEvent", attackerName: "Campaign", targetName: campaign.targetName, percentage: campaign.percentage, removed, newScore: scores[targetKey].score, timestamp: Date.now(), campaign: true });
          const correctionMsg = JSON.stringify({ type: "scoreCorrection", targetName: campaign.targetName, newScore: scores[targetKey].score, delta: -removed });
          for (const [ws] of this.connections) {
            try { ws.send(cutEvent); ws.send(correctionMsg); } catch (e) { this.connections.delete(ws); }
          }
          this.sendPushToPlayer(campaign.targetName, "Campaign executed!", (campaign.type === "wipe" ? "Total wipe" : campaign.percentage + "% cut") + " — lost " + removed.toLocaleString() + " coins!", "campaign");
        }
      }
      this.campaigns = campaigns;
      await this.saveCampaigns();
      this.broadcast();
      return new Response(JSON.stringify({ ok: true, campaign }), { headers: { "Content-Type": "application/json" } });
    }

    // ── Push: subscribe (Expo Push tokens)
    if (url.pathname === "/push/subscribe" && request.method === "POST") {
      const body = await request.json();
      const requestedName = String(body.playerName || "").slice(0, 20);
      const auth = await this.authorizePlayerRequest(request, requestedName || null);
      if (!auth) return this.jsonError("Unauthorized");
      const playerName = auth.displayName;
      const expoPushToken = body.expoPushToken || body.token;
      if (!playerName || !expoPushToken) return new Response(JSON.stringify({ error: "playerName and expoPushToken required" }), { status: 400 });
      const subs = await this.loadPushSubscriptions();
      const key = playerName.toLowerCase();
      if (!subs[key]) subs[key] = [];
      subs[key] = subs[key].filter(t => (typeof t === "string" ? t : t.expoPushToken) !== expoPushToken);
      subs[key].push({ expoPushToken, addedAt: Date.now() });
      if (subs[key].length > 5) subs[key] = subs[key].slice(-5);
      this.pushSubscriptions = subs;
      await this.savePushSubscriptions();
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }

    // ── Push: unsubscribe
    if (url.pathname === "/push/unsubscribe" && request.method === "POST") {
      const body = await request.json();
      const requestedName = String(body.playerName || "").slice(0, 20);
      const auth = await this.authorizePlayerRequest(request, requestedName || null);
      if (!auth) return this.jsonError("Unauthorized");
      const playerName = auth.displayName;
      const expoPushToken = body.expoPushToken || body.token;
      if (!playerName || !expoPushToken) return new Response(JSON.stringify({ error: "playerName and expoPushToken required" }), { status: 400 });
      const subs = await this.loadPushSubscriptions();
      const key = playerName.toLowerCase();
      if (subs[key]) {
        subs[key] = subs[key].filter(t => (typeof t === "string" ? t : t.expoPushToken) !== expoPushToken);
        if (subs[key].length === 0) delete subs[key];
        this.pushSubscriptions = subs;
        await this.savePushSubscriptions();
      }
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }

    if (url.pathname === "/skins/data" && request.method === "GET") {
      const auth = await this.authorizePlayerRequest(request);
      if (!auth) return this.jsonError("Unauthorized");
      const skinData = await this.loadSkinData();
      const key = auth.displayName.toLowerCase();
      return new Response(JSON.stringify({
        owned: { [key]: skinData.owned[key] || [] },
        equipped: { [key]: skinData.equipped[key] || null },
        custom: skinData.custom || {},
      }), { headers: { "Content-Type": "application/json" } });
    }

    // ── Skin operations
    if (url.pathname === "/skins/unlock" && request.method === "POST") {
      if (!internalRequest) return this.jsonError("Unauthorized");
      const body = await request.json();
      const skinId = String(body.skinId || "");
      const playerName = String(body.playerName || "").slice(0, 20);
      const paymentIntentId = String(body.paymentIntentId || "").trim();
      if (!skinId || !playerName) return new Response(JSON.stringify({ error: "skinId and playerName required" }), { status: 400 });
      await this.runPaymentFulfillment(paymentIntentId, async () => {
        const skinData = await this.loadSkinData();
        const key = playerName.toLowerCase();
        if (!skinData.owned[key]) skinData.owned[key] = [];
        if (!skinData.owned[key].includes(skinId)) skinData.owned[key].push(skinId);
        await this.saveSkinData();
        return { playerName, skinId };
      });
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }

    if (url.pathname === "/skins/equip" && request.method === "POST") {
      const body = await request.json();
      const skinId = String(body.skinId || "");
      const requestedName = String(body.playerName || "").slice(0, 20);
      const auth = await this.authorizePlayerRequest(request, requestedName || null);
      if (!auth) return this.jsonError("Unauthorized");
      const playerName = auth.displayName;
      if (!playerName) return new Response(JSON.stringify({ error: "playerName required" }), { status: 400 });
      const skinData = await this.loadSkinData();
      const key = playerName.toLowerCase();
      if (skinId === "" || skinId === "default") {
        delete skinData.equipped[key];
      } else {
        skinData.equipped[key] = skinId;
      }
      await this.saveSkinData();
      this.broadcast();
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }

    if (url.pathname === "/skins/save-custom" && request.method === "POST") {
      if (!internalRequest) return this.jsonError("Unauthorized");
      const body = await request.json();
      const paymentIntentId = String(body.paymentIntentId || "").trim();
      await this.runPaymentFulfillment(paymentIntentId, async () => {
        const skinData = await this.loadSkinData();
        const key = body.playerName.toLowerCase();
        skinData.custom[body.skinId] = { description: body.description, assets: body.assets, createdAt: Date.now(), apiCostCents: body.apiCostCents };
        if (!skinData.owned[key]) skinData.owned[key] = [];
        skinData.owned[key].push(body.skinId);
        await this.saveSkinData();
        return { playerName: body.playerName, skinId: body.skinId };
      });
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }

    // ── Chat: paginated history (load older messages)
    if (url.pathname === "/chat/history" && request.method === "GET") {
      const msgs = await this.loadChat();
      const before = parseInt(url.searchParams?.get("before") || "0", 10);
      const limit = Math.min(parseInt(url.searchParams?.get("limit") || "100", 10), 200);

      let filtered = msgs;
      if (before > 0) {
        filtered = msgs.filter(m => m.timestamp && m.timestamp < before);
      }

      const page = filtered.slice(-limit);
      const hasMore = filtered.length > limit;

      return new Response(JSON.stringify({
        messages: page,
        hasMore,
        totalCount: msgs.length,
      }), { headers: { "Content-Type": "application/json" } });
    }

    // ── Import score (migration endpoint)
    if (url.pathname === "/import-score" && request.method === "POST") {
      const body = await request.json();
      if (body.name && body.score) {
        await this.saveScore(String(body.name).slice(0, 20), Math.floor(body.score));
      }
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }

    // ── Debug state
    if (url.pathname === "/debug-state") {
      if (!internalRequest) return this.jsonError("Unauthorized");
      const scores = await this.loadScores();
      const epoch = await this.loadScoreEpoch();
      return new Response(JSON.stringify({
        epoch, connCount: this.connections.size,
        persistedScoreCount: Object.keys(scores).length,
        topScores: Object.values(scores).sort((a, b) => b.score - a.score).slice(0, 10),
        debug: this._debugCounters,
      }), { headers: { "Content-Type": "application/json" } });
    }

    // ── Broadcast raised (called by router after Stripe webhook)
    if (url.pathname === "/broadcast-raised" && request.method === "POST") {
      if (!internalRequest) return this.jsonError("Unauthorized");
      const body = await request.json();
      const msg = JSON.stringify({
        type: "totalRaised",
        totalRaisedCents: body.totalRaisedCents,
        transactionCount: body.transactionCount,
        funds: body.funds || [],
      });
      for (const [ws] of this.connections) { try { ws.send(msg); } catch (e) { this.connections.delete(ws); } }
      return new Response("ok");
    }

    // ── WebSocket upgrade
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    const country = request.headers.get("CF-IPCountry") || "??";
    const city = request.cf?.city || "";

    server.accept();
    this.connections.set(server, { country, city, joinedAt: Date.now() });

    // Send recent chat history (last 200) + org config to new connection
    // Full history available via /chat/history?before=<timestamp>&limit=50
    this.loadChat().then(msgs => {
      if (msgs.length > 0) {
        const recent = msgs.slice(-200);
        try { server.send(JSON.stringify({ type: "chatHistory", messages: recent, totalCount: msgs.length })); } catch (e) {}
      }
    });
    this.loadOrgConfig().then(config => {
      try { server.send(JSON.stringify({ type: "orgConfig", config })); } catch (e) {}
    });

    this.loadScoreEpoch();
    this.broadcast();

    server.addEventListener("message", async (event) => {
      try {
        const msg = JSON.parse(event.data);
        const info = this.connections.get(server);
        if (!info) return;

        if (msg.type === "setName" && msg.name) {
          if (!info.authenticated) {
            this.sendUnauthorized(server, "identity_required");
            return;
          }
          if (msg.deviceId) info.deviceId = String(msg.deviceId).slice(0, 64);
          return;
        }

        if (msg.type === "setIdentity") {
          const requestedName = String(msg.name || "").slice(0, 20).trim();
          const token = String(msg.authToken || msg.token || "");
          const auth = await this.authenticatePlayerToken(token, requestedName || null);
          if (!auth) {
            this.sendUnauthorized(server, "invalid_token");
            return;
          }
          const oldName = info.name || "";
          if (msg.deviceId) info.deviceId = String(msg.deviceId).slice(0, 64);
          info.name = auth.displayName;
          info.authenticated = true;
          info.accountKey = auth.key;
          info.authToken = auth.token;
          this.clearForfeitTimerForPlayer(info.name);
          if (oldName && info.name && oldName !== info.name) this.renameScore(oldName, info.name);
          try { server.send(JSON.stringify({ type: "identityAccepted", name: info.name })); } catch {}
          // Broadcast so online list updates for everyone
          this.broadcast();
          return;
        }

        if (msg.type === "scoreUpdate" && msg.name && typeof msg.score === "number") {
          const token = String(msg.authToken || "");
          const auth = await this.authenticatePlayerToken(token, String(msg.name || "").slice(0, 20).trim());
          if (!auth) {
            this.sendUnauthorized(server, "invalid_token");
            return;
          }
          info.name = auth.displayName;
          info.authenticated = true;
          info.accountKey = auth.key;
          info.authToken = auth.token;
          if (this.bannedPlayers && this.bannedPlayers[info.name.toLowerCase()]) {
            const bp = this.bannedPlayers[info.name.toLowerCase()];
            if (bp.until > Date.now()) {
              try { server.send(JSON.stringify({ type: "banned", until: bp.until, reason: bp.reason })); } catch (e) {}
              return;
            }
          }
          this.checkAutoClickerAndBan(info.name, Math.floor(msg.score), {
            coinsPerClick: msg.coinsPerClick || 0,
            coinsPerSecond: msg.coinsPerSecond || 0,
          });
          const clientEpoch = typeof msg.scoreEpoch === "number" ? msg.scoreEpoch : undefined;
          const svrEpoch = this.scoreEpoch || 0;
          if (svrEpoch > 0 && typeof clientEpoch === "number" && clientEpoch < svrEpoch) {
            info.score = 0;
            try { server.send(JSON.stringify({ type: "resetAll", scoreEpoch: svrEpoch })); } catch (e) {}
            return;
          }
          info.score = Math.floor(msg.score);
          info.stats = {
            totalClicks: Math.floor(msg.totalClicks || 0),
            coinsPerClick: Math.floor(msg.coinsPerClick || 0),
            coinsPerSecond: Math.floor(msg.coinsPerSecond || 0),
          };
          this.saveScore(info.name, info.score, info.stats, clientEpoch);
          this.scheduleBroadcast();
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

        if (msg.type === "chat" && (msg.message || msg.gif) && info.name) {
          if (!info.authenticated) {
            this.sendUnauthorized(server, "identity_required");
            return;
          }
          const cleanMsg = this.filterProfanity(String(msg.message).slice(0, 200));
          const chatEntry = {
            type: "chat", name: info.name, message: cleanMsg, timestamp: Date.now(),
            id: "m_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
          };
          // Support reply-to
          if (msg.replyTo) {
            chatEntry.replyTo = { id: String(msg.replyTo.id || ""), name: String(msg.replyTo.name || ""), message: String(msg.replyTo.message || "").slice(0, 60) };
          }
          // Support GIF
          if (msg.gif) {
            chatEntry.gif = { url: String(msg.gif.url || ""), width: Number(msg.gif.width) || 200, height: Number(msg.gif.height) || 200 };
            chatEntry.message = chatEntry.message || ""; // GIF can be sent without text
          }
          this.loadChat().then(() => {
            this.chatMessages.push(chatEntry);
            if (this.chatMessages.length > 2000) this.chatMessages = this.chatMessages.slice(-2000);
            this.saveChat();
            this.broadcastChat(chatEntry);
            // Push notification for @mentions
            if (cleanMsg) {
              const mentions = cleanMsg.match(/@(\w+)/g);
              if (mentions) {
                for (const mention of mentions) {
                  const mentionedName = mention.slice(1);
                  if (mentionedName.toLowerCase() !== info.name.toLowerCase()) {
                    this.sendPushToPlayer(mentionedName, info.name + " mentioned you", cleanMsg.slice(0, 80), "chat_mention");
                  }
                }
              }
            }
          });
          return;
        }

        // ── Use sabotage credit (from chat/leaderboard action)
        if (msg.type === "useSabotageCredit" && info.name && msg.targetName) {
          if (!info.authenticated) { this.sendUnauthorized(server, "identity_required"); return; }
          const self = this;
          (async () => {
            const result = await self.useCredit(info.name);
            if (!result.ok) { self.sendToPlayer(info.name, { type: "error", message: result.error }); return; }
            await self.addSabotage(info.name, String(msg.targetName).slice(0, 20), 15 * 60 * 1000);
          })();
          return;
        }

        // ── Chat reaction (emoji on a message)
        if (msg.type === "chatReaction" && info.name && msg.messageId && msg.emoji) {
          if (!info.authenticated) { this.sendUnauthorized(server, "identity_required"); return; }
          const emoji = String(msg.emoji).slice(0, 4); // Single emoji
          const messageId = String(msg.messageId);
          const reaction = { type: "chatReaction", messageId, emoji, name: info.name, timestamp: Date.now() };
          // Broadcast to all (reactions are ephemeral — not persisted to chat history)
          for (const [ws2] of this.connections) { try { ws2.send(JSON.stringify(reaction)); } catch (e) {} }
          return;
        }

        // ── Battle system WS handlers
        if (msg.type === "challenge" && info.name && msg.targetName && msg.gameType && typeof msg.wagerCoins === "number") {
          if (!info.authenticated) {
            this.sendUnauthorized(server, "identity_required");
            return;
          }
          const self = this;
          (async () => {
            const validTypes = ["rps", "ttt", "trivia", "coinflip", "reaction", "connect4", "hangman", "battleship", "clickerduel"];
            if (!validTypes.includes(msg.gameType)) return;
            const wager = Math.floor(msg.wagerCoins);
            if (wager < 100 || wager > 10000000) return;
            if (info.name.toLowerCase() === msg.targetName.toLowerCase()) return;
            const scores = await self.loadScores();
            const cScore = (scores[info.name.toLowerCase()]?.score) || 0;
            const tScore = (scores[msg.targetName.toLowerCase()]?.score) || 0;
            if (wager > cScore || wager > tScore) return;
            const chalId = "c_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
            const challenge = {
              id: chalId, challengerName: info.name, targetName: msg.targetName,
              gameType: msg.gameType, wagerCoins: wager,
              challengerSource: msg.wagerSource === "wallet" ? "wallet" : "score",
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
            self.sendPushToPlayer(msg.targetName, "Battle from " + info.name + "!", msg.gameType + " for " + wager + " coins", "challenge");
          })();
          return;
        }

        if (msg.type === "acceptChallenge" && msg.challengeId) {
          if (!info.authenticated) {
            this.sendUnauthorized(server, "identity_required");
            return;
          }
          const self = this;
          (async () => {
            const challenge = self.pendingChallenges.get(msg.challengeId);
            if (!challenge) return;
            if (info.name.toLowerCase() !== challenge.targetName.toLowerCase()) return;
            self.pendingChallenges.delete(msg.challengeId);
            challenge.targetSource = msg.wagerSource === "wallet" ? "wallet" : "score";
            const d1 = challenge.challengerSource === "score" ? await self.deductWager(challenge.challengerName, challenge.wagerCoins) : true;
            const d2 = challenge.targetSource === "score" ? await self.deductWager(challenge.targetName, challenge.wagerCoins) : true;
            if (!d1 || !d2) {
              if (d1 && challenge.challengerSource === "score") await self.awardWinnings(challenge.challengerName, challenge.wagerCoins);
              if (d2 && challenge.targetSource === "score") await self.awardWinnings(challenge.targetName, challenge.wagerCoins);
              self.sendToPlayer(challenge.challengerName, { type: "challengeDeclined", challengeId: msg.challengeId, reason: "insufficient_coins" });
              return;
            }
            const game = self.createGame(challenge);
            await self.addSystemChat("\u2694\uFE0F " + challenge.challengerName + " vs " + challenge.targetName + " — " + challenge.gameType + " for " + challenge.wagerCoins + " coins!");
            if (challenge.gameType === "coinflip") {
              self.sendToPlayer(challenge.challengerName, { type: "gameStarted", game });
              self.sendToPlayer(challenge.targetName, { type: "gameStarted", game });
              setTimeout(async () => { await self.endGame(game, "completed"); }, 3500);
              return;
            }
            if (challenge.gameType === "clickerduel") {
              setTimeout(() => {
                if (game.winner || game._ended) return;
                game.cdStartAt = Date.now();
                game.cdEndAt = Date.now() + game.cdDuration;
                self.sendToPlayer(game.player1, { type: "gameUpdate", game: self.sanitizeGame(game, game.player1) });
                self.sendToPlayer(game.player2, { type: "gameUpdate", game: self.sanitizeGame(game, game.player2) });
                setTimeout(async () => {
                  if (game.winner || game._ended) return;
                  if (game.cdP1Taps > game.cdP2Taps) game.winner = game.player1;
                  else if (game.cdP2Taps > game.cdP1Taps) game.winner = game.player2;
                  else game.winner = "draw";
                  await self.endGame(game, "completed");
                }, game.cdDuration + 500);
              }, 3000);
            }
            self.sendToPlayer(challenge.challengerName, { type: "gameStarted", game: self.sanitizeGame(game, challenge.challengerName) });
            self.sendToPlayer(challenge.targetName, { type: "gameStarted", game: self.sanitizeGame(game, challenge.targetName) });
          })();
          return;
        }

        if (msg.type === "declineChallenge" && msg.challengeId) {
          if (!info.authenticated) {
            this.sendUnauthorized(server, "identity_required");
            return;
          }
          const challenge = this.pendingChallenges.get(msg.challengeId);
          if (challenge && info.name.toLowerCase() === challenge.targetName.toLowerCase()) {
            this.pendingChallenges.delete(msg.challengeId);
            this.sendToPlayer(challenge.challengerName, { type: "challengeDeclined", challengeId: msg.challengeId, reason: "declined" });
          }
          return;
        }

        if (msg.type === "createCampaign" && info.name && msg.targetName) {
          if (!info.authenticated) { this.sendUnauthorized(server, "identity_required"); return; }
          const self = this;
          (async () => {
            const campaigns = await self.loadCampaigns();
            const targetName = String(msg.targetName).slice(0, 20);
            const type = msg.campaignType === "wipe" ? "wipe" : "cut";
            const percentage = type === "cut" ? Math.min(40, Math.max(10, Number(msg.percentage) || 20)) : 100;
            const totalPriceCents = type === "wipe" ? 1000 : Math.ceil(percentage / 10) * 100;
            // Check for existing active campaign against this target
            const existing = Object.values(campaigns).find(c => c.status === "active" && c.targetName.toLowerCase() === targetName.toLowerCase());
            if (existing) { self.sendToPlayer(info.name, { type: "campaignError", error: "Active campaign already exists against this player" }); return; }
            const campaignId = "camp_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
            campaigns[campaignId] = {
              id: campaignId, type, percentage, targetName, creatorName: info.name,
              totalPriceCents, contributedCents: 0, contributors: [],
              status: "active", createdAt: Date.now(),
            };
            self.campaigns = campaigns;
            await self.saveCampaigns();
            await self.addSystemChat("\uD83D\uDCE2 " + info.name + " started a " + (type === "wipe" ? "Total Wipe" : percentage + "% Coin Cut") + " campaign against " + targetName + "!");
            self.sendToPlayer(info.name, { type: "campaignCreated", campaignId, campaign: campaigns[campaignId] });
            self.sendPushToPlayer(targetName, "Campaign started!", info.name + " started a " + (type === "wipe" ? "Total Wipe" : percentage + "% cut") + " campaign against you!", "campaign");
            self.broadcast();
          })();
          return;
        }

        if (msg.type === "forfeitGame" && msg.gameId && info.name) {
          const fGame = this.activeGames.get(msg.gameId);
          if (fGame && !fGame.winner && !fGame._ended) {
            const fIsP1 = fGame.player1.toLowerCase() === info.name.toLowerCase();
            const fIsP2 = fGame.player2.toLowerCase() === info.name.toLowerCase();
            if (fIsP1 || fIsP2) {
              fGame.winner = fIsP1 ? fGame.player2 : fGame.player1;
              const self = this;
              (async () => { await self.endGame(fGame, "forfeit"); })();
            }
          }
          return;
        }

        if (msg.type === "gameMove" && msg.gameId && msg.move !== undefined) {
          if (!info.authenticated) {
            this.sendUnauthorized(server, "identity_required");
            return;
          }
          const game = this.activeGames.get(msg.gameId);
          if (game && info.name) {
            this.processMove(game, info.name, msg.move);
          }
          return;
        }

        // Group game handlers
        if (msg.type === "createGroupLobby" && info.name) {
          if (!info.authenticated) {
            this.sendUnauthorized(server, "identity_required");
            return;
          }
          const lobby = this.createGroupLobby(info.name, msg.gameType || "lastclick", msg.wagerCoins || 500, msg.minPlayers, msg.maxPlayers);
          this.sendToPlayer(info.name, { type: "groupLobbyCreated", lobby });
          this.broadcast();
          return;
        }

        if (msg.type === "joinGroupLobby" && info.name && msg.lobbyId) {
          if (!info.authenticated) {
            this.sendUnauthorized(server, "identity_required");
            return;
          }
          const lobby = this.groupLobbies.get(msg.lobbyId);
          if (lobby && lobby.status === "waiting" && !lobby.players.includes(info.name) && lobby.players.length < lobby.maxPlayers) {
            lobby.players.push(info.name);
            for (const p of lobby.players) this.sendToPlayer(p, { type: "groupLobbyUpdate", lobby });
            this.broadcast();
          }
          return;
        }

        if (msg.type === "startGroupGame" && info.name && msg.lobbyId) {
          if (!info.authenticated) {
            this.sendUnauthorized(server, "identity_required");
            return;
          }
          const lobby = this.groupLobbies.get(msg.lobbyId);
          if (lobby && lobby.hostName === info.name && lobby.status === "waiting" && lobby.players.length >= lobby.minPlayers) {
            this.startGroupGame(lobby);
          }
          return;
        }

        if (msg.type === "groupMove" && info.name && msg.gameId) {
          const game = this.activeGames.get(msg.gameId);
          if (game && game.players) this.processGroupMove(game, info.name, msg.move);
          return;
        }

        if ((msg.type === "spectateGame" || msg.type === "watchGame") && msg.gameId && info.name) {
          const wGame = this.activeGames.get(msg.gameId);
          if (wGame) {
            if (!wGame.spectators) wGame.spectators = [];
            if (!wGame.spectators.some(s => s.toLowerCase() === info.name.toLowerCase())) {
              wGame.spectators.push(info.name);
            }
            // Send current game state to the new spectator
            const spectatorView = wGame.players
              ? this.sanitizeGroupGame(wGame, null)
              : this.sanitizeGame(wGame, null);
            this.sendToPlayer(info.name, { type: wGame.players ? "groupGameUpdate" : "gameUpdate", game: spectatorView });
          }
          return;
        }

        if ((msg.type === "stopWatching" || msg.type === "leaveSpectate") && msg.gameId && info.name) {
          const swGame = this.activeGames.get(msg.gameId);
          if (swGame && swGame.spectators) {
            swGame.spectators = swGame.spectators.filter(s => s.toLowerCase() !== info.name.toLowerCase());
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
            if (bGame.players && bGame.players.includes(info.name)) return;
            if (!bGame.spectatorBets) bGame.spectatorBets = [];
            if (bGame.spectatorBets.some(b => b.name.toLowerCase() === info.name.toLowerCase())) return;
            const ok = await self.deductWager(info.name, betAmount);
            if (!ok) return;
            bGame.spectatorBets.push({ name: info.name, betOn: msg.betOn, amount: betAmount });
            self.sendToPlayer(info.name, { type: "spectatorBetPlaced", gameId: msg.gameId, betOn: msg.betOn, amount: betAmount });
            self.broadcastGroupGame(bGame);
          })();
          return;
        }

      } catch (e) {
        // Silently ignore malformed messages
      }
    });

    server.addEventListener("close", () => {
      const info = this.connections.get(server);
      this.connections.delete(server);
      // Start forfeit timer if player was in a game
      if (info && info.name) {
        const pName = info.name.toLowerCase();
        for (const [gameId, game] of this.activeGames) {
          if (game._ended || game.winner) continue;
          // 1v1 games
          if (game.player1 && game.player2) {
            const isPlayer = game.player1.toLowerCase() === pName || game.player2.toLowerCase() === pName;
            if (isPlayer) {
              const self = this;
              const timer = setTimeout(async () => {
                if (game._ended || game.winner) return;
                const opponent = game.player1.toLowerCase() === pName ? game.player2 : game.player1;
                game.winner = opponent;
                await self.endGame(game, "forfeit");
              }, 30000);
              this.forfeitTimers.set(gameId, { timer, playerName: info.name });
            }
          }
          // Group games
          if (game.players && game.alive) {
            const idx = game.alive.findIndex(p => p.toLowerCase() === pName);
            if (idx !== -1) {
              // Remove from alive list immediately
              game.alive.splice(idx, 1);
              if (!game.eliminated) game.eliminated = [];
              game.eliminated.push(info.name);
              this.broadcastGroupGame(game);
              // If only one alive, they win
              if (game.alive.length <= 1 && !game._ended) {
                const self = this;
                (async () => {
                  if (game.alive.length === 1) game.winner = game.alive[0];
                  else game.winner = "draw";
                  await self.endGroupGame(game, "forfeit");
                })();
              }
            }
          }
        }
      }
      this.broadcast();
    });

    server.addEventListener("error", () => {
      this.connections.delete(server);
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  // ─── MOVE PROCESSING (simplified — covers main game types) ──────────────

  async processMove(game, playerName, move) {
    if (game.winner || game._ended) return;
    const isP1 = game.player1.toLowerCase() === playerName.toLowerCase();
    const isP2 = game.player2.toLowerCase() === playerName.toLowerCase();
    if (!isP1 && !isP2) return;

    if (game.type === "rps") {
      const valid = ["rock", "paper", "scissors"];
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
        if (result === "p1") game.p1Score++;
        else if (result === "p2") game.p2Score++;
        const roundsNeeded = Math.ceil(game.maxRounds / 2);
        if (game.p1Score >= roundsNeeded || game.p2Score >= roundsNeeded || game.rpsResults.length >= game.maxRounds) {
          if (game.p1Score > game.p2Score) game.winner = game.player1;
          else if (game.p2Score > game.p1Score) game.winner = game.player2;
          else game.winner = "draw";
          this.sendToPlayer(game.player1, { type: "gameUpdate", game: { ...this.sanitizeGame(game, game.player1), rpsReveal: reveal } });
          this.sendToPlayer(game.player2, { type: "gameUpdate", game: { ...this.sanitizeGame(game, game.player2), rpsReveal: reveal } });
          await this.endGame(game, "completed");
        } else {
          this.sendToPlayer(game.player1, { type: "gameUpdate", game: { ...this.sanitizeGame(game, game.player1), rpsReveal: reveal } });
          this.sendToPlayer(game.player2, { type: "gameUpdate", game: { ...this.sanitizeGame(game, game.player2), rpsReveal: reveal } });
          game.rpsRound = { p1Move: null, p2Move: null };
          game.round++;
          const self = this;
          setTimeout(() => {
            self.sendToPlayer(game.player1, { type: "gameUpdate", game: self.sanitizeGame(game, game.player1) });
            self.sendToPlayer(game.player2, { type: "gameUpdate", game: self.sanitizeGame(game, game.player2) });
          }, 2000);
        }
      }
    } else if (game.type === "ttt") {
      const pos = Number(move);
      if (pos < 0 || pos > 8 || game.tttBoard[pos] !== null) return;
      if ((isP1 && game.tttCurrentTurn !== game.player1) || (isP2 && game.tttCurrentTurn !== game.player2)) return;
      game.tttBoard[pos] = game.tttSymbols[playerName] || (isP1 ? "X" : "O");
      const winner = this.checkTttWinner(game.tttBoard);
      if (winner) {
        game.winner = winner === game.tttSymbols[game.player1] ? game.player1 : game.player2;
        this.sendToPlayer(game.player1, { type: "gameUpdate", game: this.sanitizeGame(game, game.player1) });
        this.sendToPlayer(game.player2, { type: "gameUpdate", game: this.sanitizeGame(game, game.player2) });
        await this.endGame(game, "completed");
      } else if (!game.tttBoard.includes(null)) {
        game.winner = "draw";
        this.sendToPlayer(game.player1, { type: "gameUpdate", game: this.sanitizeGame(game, game.player1) });
        this.sendToPlayer(game.player2, { type: "gameUpdate", game: this.sanitizeGame(game, game.player2) });
        await this.endGame(game, "completed");
      } else {
        game.tttCurrentTurn = game.tttCurrentTurn === game.player1 ? game.player2 : game.player1;
        this.sendToPlayer(game.player1, { type: "gameUpdate", game: this.sanitizeGame(game, game.player1) });
        this.sendToPlayer(game.player2, { type: "gameUpdate", game: this.sanitizeGame(game, game.player2) });
      }
    } else if (game.type === "trivia") {
      const answerIndex = Number(move);
      if (isP1 && game.triviaP1Answer === null) { game.triviaP1Answer = answerIndex; game.triviaP1Time = Date.now() - game.triviaStartedAt; }
      else if (isP2 && game.triviaP2Answer === null) { game.triviaP2Answer = answerIndex; game.triviaP2Time = Date.now() - game.triviaStartedAt; }
      if (game.triviaP1Answer !== null && game.triviaP2Answer !== null) {
        const p1Correct = game.triviaP1Answer === game.triviaCorrectIndex;
        const p2Correct = game.triviaP2Answer === game.triviaCorrectIndex;
        if (p1Correct && !p2Correct) game.winner = game.player1;
        else if (p2Correct && !p1Correct) game.winner = game.player2;
        else if (p1Correct && p2Correct) game.winner = game.triviaP1Time <= game.triviaP2Time ? game.player1 : game.player2;
        else game.winner = "draw";
        this.sendToPlayer(game.player1, { type: "gameUpdate", game });
        this.sendToPlayer(game.player2, { type: "gameUpdate", game });
        await this.endGame(game, "completed");
      } else {
        this.sendToPlayer(game.player1, { type: "gameUpdate", game: this.sanitizeGame(game, game.player1) });
        this.sendToPlayer(game.player2, { type: "gameUpdate", game: this.sanitizeGame(game, game.player2) });
      }
    } else if (game.type === "clickerduel") {
      if (!game.cdStartAt || Date.now() > game.cdEndAt) return;
      if (isP1) game.cdP1Taps++;
      if (isP2) game.cdP2Taps++;
      this.sendToPlayer(game.player1, { type: "gameUpdate", game: this.sanitizeGame(game, game.player1) });
      this.sendToPlayer(game.player2, { type: "gameUpdate", game: this.sanitizeGame(game, game.player2) });
    } else if (game.type === "reaction") {
      const now = Date.now();
      if (now < game.reactionGoAt) {
        if (isP1) game.reactionP1FalseStart = true;
        if (isP2) game.reactionP2FalseStart = true;
        if (game.reactionP1FalseStart && game.reactionP2FalseStart) {
          game.winner = "draw";
          await this.endGame(game, "completed");
        } else if (game.reactionP1FalseStart) {
          game.winner = game.player2;
          await this.endGame(game, "completed");
        } else if (game.reactionP2FalseStart) {
          game.winner = game.player1;
          await this.endGame(game, "completed");
        }
        return;
      }
      if (isP1 && !game.reactionP1Tap) game.reactionP1Tap = now - game.reactionGoAt;
      if (isP2 && !game.reactionP2Tap) game.reactionP2Tap = now - game.reactionGoAt;
      if (game.reactionP1Tap && game.reactionP2Tap) {
        game.winner = game.reactionP1Tap <= game.reactionP2Tap ? game.player1 : game.player2;
        await this.endGame(game, "completed");
      } else {
        this.sendToPlayer(game.player1, { type: "gameUpdate", game: this.sanitizeGame(game, game.player1) });
        this.sendToPlayer(game.player2, { type: "gameUpdate", game: this.sanitizeGame(game, game.player2) });
      }
    } else if (game.type === "connect4") {
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
        game.winner = c4win.winner === "draw" ? "draw" : playerName;
        game.c4WinCells = c4win.winCells || [];
        this.sendToPlayer(game.player1, { type: "gameUpdate", game: this.sanitizeGame(game, game.player1) });
        this.sendToPlayer(game.player2, { type: "gameUpdate", game: this.sanitizeGame(game, game.player2) });
        await this.endGame(game, "completed");
      } else {
        game.c4CurrentTurn = isP1 ? game.player2 : game.player1;
        this.sendToPlayer(game.player1, { type: "gameUpdate", game: this.sanitizeGame(game, game.player1) });
        this.sendToPlayer(game.player2, { type: "gameUpdate", game: this.sanitizeGame(game, game.player2) });
      }
    } else if (game.type === "hangman") {
      const letter = String(move).toUpperCase().charAt(0);
      if (!/[A-Z]/.test(letter)) return;
      const guesses = isP1 ? game.hangmanP1Guesses : game.hangmanP2Guesses;
      if (guesses.includes(letter)) return;
      guesses.push(letter);
      if (!game.hangmanWord.includes(letter)) {
        if (isP1) game.hangmanP1Wrong++;
        else game.hangmanP2Wrong++;
      }
      const wordLetters = game.hangmanWord.split("").filter(function(v, i, a) { return a.indexOf(v) === i; });
      const p1Done = wordLetters.every(function(l) { return game.hangmanP1Guesses.includes(l); });
      const p2Done = wordLetters.every(function(l) { return game.hangmanP2Guesses.includes(l); });
      const p1Dead = game.hangmanP1Wrong >= game.hangmanMaxWrong;
      const p2Dead = game.hangmanP2Wrong >= game.hangmanMaxWrong;
      if (p1Done && !p2Done) game.winner = game.player1;
      else if (p2Done && !p1Done) game.winner = game.player2;
      else if (p1Done && p2Done) game.winner = "draw";
      else if (p1Dead && p2Dead) game.winner = "draw";
      else if (p1Dead) game.winner = game.player2;
      else if (p2Dead) game.winner = game.player1;
      if (game.winner) {
        this.sendToPlayer(game.player1, { type: "gameUpdate", game: { ...game } });
        this.sendToPlayer(game.player2, { type: "gameUpdate", game: { ...game } });
        await this.endGame(game, "completed");
      } else {
        this.sendToPlayer(game.player1, { type: "gameUpdate", game: this.sanitizeGame(game, game.player1) });
        this.sendToPlayer(game.player2, { type: "gameUpdate", game: this.sanitizeGame(game, game.player2) });
      }
    } else if (game.type === "battleship") {
      if (game.bsCurrentTurn.toLowerCase() !== playerName.toLowerCase()) return;
      let x, y;
      if (typeof move === "object" && move !== null) { x = move.x; y = move.y; }
      else { const coords = String(move).split(","); x = parseInt(coords[0]); y = parseInt(coords[1]); }
      if (isNaN(x) || isNaN(y) || x < 0 || x >= game.bsSize || y < 0 || y >= game.bsSize) return;
      const myShots = isP1 ? game.bsShots.p1 : game.bsShots.p2;
      if (myShots.some(function(s) { return s.x === x && s.y === y; })) return;
      const enemyShips = isP1 ? game.bsShips.p2 : game.bsShips.p1;
      const hitResult = this.checkBsHit(enemyShips, x, y);
      myShots.push({ x, y, hit: hitResult.hit });
      let sunkCount = 0;
      for (const ship of enemyShips) {
        if (this.checkBsShipSunk(ship, myShots)) sunkCount++;
      }
      if (isP1) game.bsSunk.p1 = sunkCount;
      else game.bsSunk.p2 = sunkCount;
      if (sunkCount >= game.bsTotalShips) {
        game.winner = playerName;
        this.sendToPlayer(game.player1, { type: "gameUpdate", game: this.sanitizeGame(game, game.player1) });
        this.sendToPlayer(game.player2, { type: "gameUpdate", game: this.sanitizeGame(game, game.player2) });
        await this.endGame(game, "completed");
      } else {
        if (!hitResult.hit) {
          game.bsCurrentTurn = isP1 ? game.player2 : game.player1;
        }
        this.sendToPlayer(game.player1, { type: "gameUpdate", game: this.sanitizeGame(game, game.player1) });
        this.sendToPlayer(game.player2, { type: "gameUpdate", game: this.sanitizeGame(game, game.player2) });
      }
    }
    // Broadcast to spectators after every move
    if (game.spectators && game.spectators.length > 0 && !game._ended) {
      const spectatorView = this.sanitizeGame(game, null);
      for (const s of game.spectators) {
        this.sendToPlayer(s, { type: "gameUpdate", game: spectatorView });
      }
    }
  }

  checkTttWinner(board) {
    const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    for (const [a, b, c] of lines) {
      if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
    }
    return null;
  }

  checkC4Winner(board, lastCol, lastRow, sym) {
    const dirs = [[1,0],[0,1],[1,1],[1,-1]];
    for (const [dc, dr] of dirs) {
      const cells = [{ c: lastCol, r: lastRow }];
      for (let i = 1; i < 4; i++) { const c = lastCol+dc*i, r = lastRow+dr*i; if (c<0||c>6||r<0||r>5||board[c][r]!==sym) break; cells.push({c,r}); }
      for (let i = 1; i < 4; i++) { const c = lastCol-dc*i, r = lastRow-dr*i; if (c<0||c>6||r<0||r>5||board[c][r]!==sym) break; cells.push({c,r}); }
      if (cells.length >= 4) return { winner: sym, winCells: cells };
    }
    let full = true;
    for (let c = 0; c < 7; c++) { if (board[c][5] === null) { full = false; break; } }
    return full ? { winner: "draw", winCells: [] } : null;
  }

  checkBsHit(ships, x, y) {
    for (let si = 0; si < ships.length; si++) {
      const cells = ships[si].cells || ships[si];
      for (const cell of cells) {
        if (cell.x === x && cell.y === y) return { hit: true, shipIndex: si };
      }
    }
    return { hit: false };
  }

  checkBsShipSunk(ship, shots) {
    const cells = ship.cells || ship;
    return cells.every(function(cell) {
      return shots.some(function(s) { return s.x === cell.x && s.y === cell.y && s.hit; });
    });
  }

  async startGroupGame(lobby) {
    lobby.status = "playing";
    const game = {
      id: lobby.id, type: lobby.type, players: lobby.players.slice(),
      wagerCoins: lobby.wagerCoins, hostName: lobby.hostName,
      eliminated: [], winner: null, _ended: false, createdAt: Date.now(),
      spectators: [], spectatorBets: [],
    };
    for (const p of game.players) await this.deductWager(p, game.wagerCoins);
    game.pot = game.wagerCoins * game.players.length;

    if (lobby.type === "lastclick") {
      game.roundDuration = 10000;
      game.roundNumber = 0;
      game.roundClicks = {};
      game.roundStartAt = null;
      game.alive = game.players.slice();
      const self = this;
      setTimeout(() => self.startLastClickRound(game), 3000);
    } else if (lobby.type === "auction") {
      game.prizeAmount = Math.floor(game.pot * (0.5 + Math.random() * 1.5));
      game.bids = {};
      game.bidDeadline = Date.now() + 30000;
      game.revealed = false;
      const self = this;
      setTimeout(() => self.resolveAuction(game), 30000);
    } else if (lobby.type === "triviaroyale") {
      let triviaBank = DEFAULT_TRIVIA_BANK;
      if (this.orgConfig?.customTrivia?.length >= 5) triviaBank = this.orgConfig.customTrivia;
      game.questions = [];
      for (let qi = 0; qi < 5; qi++) {
        const q = triviaBank[Math.floor(Math.random() * triviaBank.length)];
        const ca = q.a[q.c];
        const sh = q.a.slice();
        for (let si = sh.length - 1; si > 0; si--) {
          const sj = Math.floor(Math.random() * (si + 1));
          [sh[si], sh[sj]] = [sh[sj], sh[si]];
        }
        game.questions.push({ q: q.q, a: sh, correct: sh.indexOf(ca) });
      }
      game.currentQuestion = 0;
      game.alive = game.players.slice();
      game.answers = {};
      game.questionStartAt = null;
      game.cumulativeTimes = {};
      for (const p of game.players) game.cumulativeTimes[p] = 0;
      const self = this;
      setTimeout(() => self.startTriviaRoyaleRound(game), 3000);
    } else {
      game.alive = game.players.slice();
    }

    this.activeGames.set(game.id, game);
    const tn = { lastclick: "Last Click Standing", auction: "Auction House", triviaroyale: "Trivia Royale" };
    await this.addSystemChat("\uD83C\uDFAE " + (tn[game.type] || game.type) + " with " + game.players.length + " players for " + game.pot + " coins!");
    for (const p of game.players) {
      this.sendToPlayer(p, { type: "groupGameStarted", game: this.sanitizeGroupGame(game, p) });
    }
    return game;
  }
}
