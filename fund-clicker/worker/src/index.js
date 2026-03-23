// Fund Clicker: Multi-Tenant Edge Router
// Thin layer that maps /api/v1/orgs/:slug/* → per-org Durable Object instances
// All game logic lives in OrgGameInstance (extracted from LiveVisitors)

import { createToken, verifyToken, hashPassword, verifyPassword, needsPasswordRehash, extractBearer, requireAdmin, generateJoinCode, isValidSlug, slugify } from "./auth.js";
import { getConnectOAuthURL, exchangeOAuthCode, createPaymentIntent, getAccountStatus, createAccountLink, verifyWebhookSignature, getPaymentIntent, calculatePlatformFee, calculateTotalFee } from "./stripe.js";

export { OrgGameInstance } from "./org-game.js";

// ─── CORS ────────────────────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function corsResponse(body, init = {}) {
  const headers = { ...corsHeaders, ...(init.headers || {}) };
  return new Response(body, { ...init, headers });
}

function jsonResponse(data, status = 200) {
  return corsResponse(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(message, status = 400) {
  return jsonResponse({ error: message }, status);
}

// ─── ORG LOOKUP (D1 → DO routing) ───────────────────────────────────────────

// In-memory cache for org lookups (slug → org row). TTL: 60s.
const orgCache = new Map();
const ORG_CACHE_TTL = 60_000;

async function lookupOrg(db, slug) {
  const cached = orgCache.get(slug);
  if (cached && Date.now() - cached.ts < ORG_CACHE_TTL) return cached.org;

  const org = await db.prepare("SELECT * FROM orgs WHERE slug = ? AND status = 'active'").bind(slug).first();
  orgCache.set(slug, { org, ts: Date.now() });
  return org;
}

async function lookupOrgByJoinCode(db, code) {
  return db.prepare("SELECT * FROM orgs WHERE join_code = ? AND status = 'active'").bind(code.toUpperCase()).first();
}

async function getOrgConfig(db, orgId) {
  return db.prepare("SELECT * FROM org_config WHERE org_id = ?").bind(orgId).first();
}

async function getOrgStripeAccount(db, orgId) {
  return db.prepare("SELECT * FROM stripe_accounts WHERE org_id = ?").bind(orgId).first();
}

// Get the Durable Object stub for an org's game instance
function getOrgDO(env, orgId) {
  const id = env.ORG_GAME.idFromName(orgId);
  return env.ORG_GAME.get(id);
}

const INTERNAL_HEADER = "X-Fund-Clicker-Internal";
const ORG_DAILY_STATS_SCOPE = "";
const SABOTAGE_CREDIT_PRICES = { 1: 99, 3: 249, 5: 399 };
const COIN_CUT_PRICES = { 1: 100, 5: 200, 10: 399, 15: 599, 20: 799, 25: 999, 30: 1299, 35: 1599, 40: 1999 };
const SKIN_PRICES = {
  "gold-rush": 599,
  "neon-glow": 599,
  "fire-coin": 599,
  "ice-crystal": 599,
  "galaxy": 799,
  "diamond": 999,
  "pixel-art": 599,
  "nature": 599,
};
const PURCHASE_SPECS = {
  sabotage_credits: { actorField: "playerName", transactionType: "sabotage", supported: true },
  coin_cut: { actorField: "attackerName", transactionType: "coin_cut", supported: true },
  break_free: { actorField: "playerName", transactionType: "sabotage", supported: true },
  skin_purchase: { actorField: "playerName", transactionType: "skin", supported: true },
  custom_skin: { actorField: "playerName", transactionType: "custom", supported: true },
  custom_coin: { actorField: "playerName", transactionType: "custom_coin", supported: true },
  coin_cut_campaign: { actorField: "contributorName", transactionType: "campaign", supported: true },
  total_wipe_campaign: { actorField: "contributorName", transactionType: "campaign", supported: true },
  double_or_nothing: { actorField: "playerName", transactionType: "double_or_nothing", supported: true },
  rematch: { actorField: "playerName", transactionType: "rematch", supported: true },
};

export class ValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "ValidationError";
    this.status = status;
    this.permanent = true;
  }
}

function parseJSONValue(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function normalizePaymentMetadata(metadata = {}) {
  const normalized = {};
  for (const [key, value] of Object.entries(metadata || {})) {
    normalized[key] = value == null ? "" : String(value);
  }
  return normalized;
}

export function getPurchaseSpec(type) {
  return type ? PURCHASE_SPECS[type] || null : null;
}

export function getPurchaseActorName(type, metadata) {
  const actorField = getPurchaseSpec(type)?.actorField;
  if (!actorField) return null;
  const raw = String(metadata?.[actorField] || "").trim();
  return raw ? raw.slice(0, 20) : null;
}

function getStripeFeeCents(intent) {
  const fee = Number(intent?.latest_charge?.balance_transaction?.fee || 0);
  return Number.isFinite(fee) ? fee : 0;
}

function getPaymentDate(intent) {
  const created = Number(intent?.created || 0);
  return new Date((created > 0 ? created * 1000 : Date.now())).toISOString().slice(0, 10);
}

function buildInternalHeaders(env, extraHeaders) {
  const headers = new Headers(extraHeaders || {});
  headers.set(INTERNAL_HEADER, env.JWT_SECRET);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return headers;
}

async function callInternalOrgRoute(env, orgId, path, { method = "POST", body, headers } = {}) {
  const doStub = getOrgDO(env, orgId);
  const req = new Request("https://fund-clicker.internal" + path, {
    method,
    headers: buildInternalHeaders(env, headers),
    body: method === "GET" || body === undefined ? undefined : JSON.stringify(body),
  });
  const res = await doStub.fetch(req);
  const text = await res.text();

  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const error = new Error((typeof data === "object" && data?.error) || `Internal org route failed (${path})`);
    error.status = res.status;
    error.permanent = res.status >= 400 && res.status < 500;
    throw error;
  }

  return data;
}

async function getAuthenticatedPlayer(doStub, request) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) return null;

  const res = await doStub.fetch(new Request("https://fund-clicker.internal/account/me", {
    method: "GET",
    headers: new Headers({ Authorization: authHeader }),
  }));

  if (!res.ok) return null;
  return res.json();
}

async function syncOrgConfigToDO(env, orgId, configRow) {
  await callInternalOrgRoute(env, orgId, "/update-config", {
    body: configRow || {},
  });
}

async function broadcastRaisedTotals(env, orgId) {
  const totals = await env.DB.prepare(
    "SELECT COUNT(*) as transactionCount, COALESCE(SUM(amount_cents), 0) as totalRaisedCents FROM transactions WHERE org_id = ? AND status = 'succeeded'"
  ).bind(orgId).first();

  await callInternalOrgRoute(env, orgId, "/broadcast-raised", {
    body: {
      transactionCount: totals?.transactionCount || 0,
      totalRaisedCents: totals?.totalRaisedCents || 0,
    },
  });
}

async function resolveFundId(db, orgId, fundId) {
  const normalized = String(fundId || "").trim();
  if (!normalized) return null;

  const fund = await db.prepare(
    "SELECT id FROM funds WHERE id = ? AND org_id = ?"
  ).bind(normalized, orgId).first();

  if (!fund) {
    throw new ValidationError("Invalid fund");
  }

  return fund.id;
}

export function resolveExpectedAmount(type, metadata) {
  switch (type) {
    case "sabotage_credits": {
      const credits = Number(metadata.credits || 0);
      const amount = SABOTAGE_CREDIT_PRICES[credits];
      if (!amount) throw new ValidationError("Invalid sabotage credit pack");
      return amount;
    }
    case "coin_cut": {
      const percentage = Number(metadata.percentage || 0);
      const amount = COIN_CUT_PRICES[percentage];
      if (!amount) throw new ValidationError("Invalid coin cut percentage");
      if (!String(metadata.targetName || "").trim()) throw new ValidationError("targetName is required");
      return amount;
    }
    case "break_free":
      return 99;
    case "skin_purchase": {
      const skinId = String(metadata.skinId || "").trim();
      const amount = SKIN_PRICES[skinId];
      if (!amount) throw new ValidationError("Invalid skin");
      return amount;
    }
    case "custom_skin":
      return 999; // $9.99 — AI-generated full skin pack
    case "custom_coin":
      return 399; // $3.99 — AI-generated custom face coin
    case "coin_cut_campaign":
    case "total_wipe_campaign": {
      const cents = Number(metadata.cents || 0);
      if (cents < 100 || cents > 10000) throw new ValidationError("Campaign contribution must be $1-$100");
      return cents;
    }
    case "double_or_nothing":
      return 99; // $0.99
    case "rematch":
      return 199; // $1.99
    default:
      throw new ValidationError("This purchase type is not available in production yet");
  }
}

async function applyPaymentEntitlement(env, orgId, paymentIntentId, type, metadata) {
  switch (type) {
    case "sabotage_credits":
      await callInternalOrgRoute(env, orgId, "/credits/add", {
        body: {
          paymentIntentId,
          playerName: metadata.playerName,
          count: Number(metadata.credits || 0),
        },
      });
      return;

    case "coin_cut":
      await callInternalOrgRoute(env, orgId, "/coincut", {
        body: {
          paymentIntentId,
          attackerName: metadata.attackerName,
          targetName: metadata.targetName,
          percentage: Number(metadata.percentage || 0),
        },
      });
      return;

    case "break_free":
      await callInternalOrgRoute(env, orgId, "/unsabotage", {
        body: {
          paymentIntentId,
          targetName: metadata.playerName,
        },
      });
      return;

    case "skin_purchase":
      await callInternalOrgRoute(env, orgId, "/skins/unlock", {
        body: {
          paymentIntentId,
          playerName: metadata.playerName,
          skinId: metadata.skinId,
        },
      });
      return;

    case "custom_skin":
      // AI-generated skin pack — generation happens async after payment
      // The DO stores the payment reference; generation is triggered separately
      await callInternalOrgRoute(env, orgId, "/skins/save-custom", {
        body: {
          paymentIntentId,
          playerName: metadata.playerName,
          description: metadata.description || "",
          status: "paid_pending_generation",
        },
      });
      return;

    case "custom_coin":
      // AI-generated custom face coin — payment captured, generation triggered separately
      // Store the payment reference in DO for async generation
      await callInternalOrgRoute(env, orgId, "/skins/save-custom", {
        body: {
          paymentIntentId,
          playerName: metadata.playerName,
          type: "custom_coin",
          description: metadata.description || "Custom face coin",
          status: "paid_pending_generation",
        },
      });
      return;

    case "coin_cut_campaign":
    case "total_wipe_campaign":
      await callInternalOrgRoute(env, orgId, "/campaign/contribute", {
        body: {
          paymentIntentId,
          campaignId: metadata.campaignId,
          contributorName: metadata.contributorName,
          cents: Number(metadata.cents || 0),
          premiumCents: Number(metadata.premiumCents || 0),
        },
      });
      return;

    case "double_or_nothing":
    case "rematch":
      // These are handled by the battle system — payment is the entitlement
      // The game server creates the rematch/double-or-nothing game on payment confirmation
      return;

    default:
      throw new ValidationError("This purchase type is not available in production yet");
  }
}

async function validateIntentForOrg(env, org, stripeAccount, intent) {
  const metadata = normalizePaymentMetadata(intent?.metadata || {});
  if (metadata.orgId !== org.id || metadata.orgSlug !== org.slug) {
    throw new ValidationError("Payment does not belong to this fundraiser", 403);
  }
  const destination = intent?.transfer_data?.destination || "";
  if (stripeAccount?.stripe_account_id && destination && destination !== stripeAccount.stripe_account_id) {
    throw new ValidationError("Payment destination does not match fundraiser", 403);
  }
  return metadata;
}

async function recordFailedPayment(env, org, intent, stripeAccount) {
  const metadata = await validateIntentForOrg(env, org, stripeAccount, intent);
  const purchaseType = String(metadata.type || "");
  const amountCents = Number(intent.amount || 0);
  const platformFeeCents = Number(intent.application_fee_amount ?? calculatePlatformFee(amountCents));
  const stripeFeeCents = getStripeFeeCents(intent);
  const spec = getPurchaseSpec(purchaseType);
  const playerName = getPurchaseActorName(purchaseType, metadata);
  const fundId = await resolveFundId(env.DB, org.id, metadata.fundId || null).catch(() => null);

  const existing = await env.DB.prepare(
    "SELECT status FROM transactions WHERE stripe_payment_intent_id = ?"
  ).bind(intent.id).first();

  if (existing?.status === "succeeded") return;

  const statement = existing
    ? env.DB.prepare(
        `UPDATE transactions
         SET org_id = ?, fund_id = ?, amount_cents = ?, platform_fee_cents = ?, stripe_fee_cents = ?, net_cents = ?,
             type = ?, player_name = ?, metadata = ?, status = 'failed'
         WHERE stripe_payment_intent_id = ?`
      ).bind(
        org.id,
        fundId,
        amountCents,
        platformFeeCents,
        stripeFeeCents,
        Math.max(0, amountCents - platformFeeCents - stripeFeeCents),
        spec?.transactionType || "purchase",
        playerName,
        JSON.stringify(metadata),
        intent.id,
      )
    : env.DB.prepare(
        `INSERT INTO transactions
         (org_id, fund_id, stripe_payment_intent_id, amount_cents, platform_fee_cents, stripe_fee_cents, net_cents, type, player_name, metadata, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'failed')`
      ).bind(
        org.id,
        fundId,
        intent.id,
        amountCents,
        platformFeeCents,
        stripeFeeCents,
        Math.max(0, amountCents - platformFeeCents - stripeFeeCents),
        spec?.transactionType || "purchase",
        playerName,
        JSON.stringify(metadata),
      );

  await statement.run();
}

export async function reconcileSuccessfulPayment(env, org, intent, stripeAccount) {
  if (intent.status !== "succeeded") {
    throw new ValidationError("Payment has not succeeded yet");
  }

  const metadata = await validateIntentForOrg(env, org, stripeAccount, intent);
  const purchaseType = String(metadata.type || "");
  const spec = getPurchaseSpec(purchaseType);
  if (!spec || !spec.supported) {
    throw new ValidationError("This purchase type is not available in production yet");
  }

  const actorName = getPurchaseActorName(purchaseType, metadata);
  if (!actorName) {
    throw new ValidationError("Missing purchase actor");
  }

  const fundId = await resolveFundId(env.DB, org.id, metadata.fundId || null);
  const amountCents = Number(intent.amount_received || intent.amount || 0);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw new ValidationError("Invalid payment amount");
  }

  const platformFeeCents = Number(intent.application_fee_amount ?? calculatePlatformFee(amountCents));
  const stripeFeeCents = getStripeFeeCents(intent);
  const netCents = Math.max(0, amountCents - platformFeeCents - stripeFeeCents);
  const metadataJson = JSON.stringify(metadata);
  const paymentDate = getPaymentDate(intent);
  const statsFundId = fundId || ORG_DAILY_STATS_SCOPE;

  const existing = await env.DB.prepare(
    "SELECT status FROM transactions WHERE stripe_payment_intent_id = ?"
  ).bind(intent.id).first();

  if (existing?.status === "succeeded") {
    return { ok: true, alreadyProcessed: true, paymentIntentId: intent.id };
  }

  const pendingStatement = existing
    ? env.DB.prepare(
        `UPDATE transactions
         SET org_id = ?, fund_id = ?, amount_cents = ?, platform_fee_cents = ?, stripe_fee_cents = ?, net_cents = ?,
             type = ?, player_name = ?, metadata = ?, status = 'pending'
         WHERE stripe_payment_intent_id = ?`
      ).bind(org.id, fundId, amountCents, platformFeeCents, stripeFeeCents, netCents, spec.transactionType, actorName, metadataJson, intent.id)
    : env.DB.prepare(
        `INSERT INTO transactions
         (org_id, fund_id, stripe_payment_intent_id, amount_cents, platform_fee_cents, stripe_fee_cents, net_cents, type, player_name, metadata, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
      ).bind(org.id, fundId, intent.id, amountCents, platformFeeCents, stripeFeeCents, netCents, spec.transactionType, actorName, metadataJson);

  await pendingStatement.run();

  try {
    await applyPaymentEntitlement(env, org.id, intent.id, purchaseType, metadata);

    await env.DB.batch([
      env.DB.prepare(
        "UPDATE transactions SET status = 'succeeded', metadata = ? WHERE stripe_payment_intent_id = ?"
      ).bind(metadataJson, intent.id),
      env.DB.prepare(
        `INSERT INTO daily_stats (org_id, fund_id, date, gross_revenue_cents, platform_fee_cents, net_revenue_cents)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(org_id, fund_id, date) DO UPDATE SET
           gross_revenue_cents = daily_stats.gross_revenue_cents + excluded.gross_revenue_cents,
           platform_fee_cents = daily_stats.platform_fee_cents + excluded.platform_fee_cents,
           net_revenue_cents = daily_stats.net_revenue_cents + excluded.net_revenue_cents`
      ).bind(org.id, statsFundId, paymentDate, amountCents, platformFeeCents, netCents),
    ]);
  } catch (error) {
    await env.DB.prepare(
      "UPDATE transactions SET status = 'failed', metadata = ? WHERE stripe_payment_intent_id = ? AND status != 'succeeded'"
    ).bind(metadataJson, intent.id).run();
    throw error;
  }

  await broadcastRaisedTotals(env, org.id);
  return { ok: true, alreadyProcessed: false, paymentIntentId: intent.id };
}

async function lookupOrgForIntent(db, intent) {
  const metadata = normalizePaymentMetadata(intent?.metadata || {});
  if (metadata.orgId) {
    const org = await db.prepare("SELECT * FROM orgs WHERE id = ?").bind(metadata.orgId).first();
    if (org) return org;
  }

  const destination = intent?.transfer_data?.destination;
  if (!destination) return null;

  return db.prepare(
    `SELECT orgs.*
     FROM stripe_accounts
     JOIN orgs ON orgs.id = stripe_accounts.org_id
     WHERE stripe_accounts.stripe_account_id = ?`
  ).bind(destination).first();
}

// ─── MAIN ROUTER ─────────────────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return corsResponse(null, { status: 204 });
    }

    // ── Health check
    if (url.pathname === "/health") {
      return jsonResponse({ status: "ok", version: "1.0.0" });
    }

    // ── Serve assets from R2 (vibe assets, org-specific assets like coins/photos/skins)
    if ((url.pathname.startsWith("/vibes/") || url.pathname.startsWith("/orgs-assets/")) && request.method === "GET") {
      // Map URL paths to R2 keys:
      //   /vibes/retro-arcade/coin.png → vibes/retro-arcade/coin.png
      //   /orgs-assets/jared-clicker/coin.png → orgs/jared-clicker/coin.png
      let key = url.pathname.slice(1);
      if (key.startsWith("orgs-assets/")) {
        key = "orgs/" + key.slice("orgs-assets/".length);
      }
      try {
        const obj = await env.ASSETS.get(key);
        if (!obj) return corsResponse("Not found", { status: 404 });
        const contentType = obj.httpMetadata?.contentType
          || (key.endsWith(".json") ? "application/json" : key.endsWith(".mp3") ? "audio/mpeg" : key.endsWith(".wav") ? "audio/wav" : "image/png");
        const headers = {
          ...corsHeaders,
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=604800, immutable",
        };
        return new Response(obj.body, { headers });
      } catch {
        return corsResponse("Asset error", { status: 500 });
      }
    }

    // ── Platform endpoints (/api/v1/platform/*)
    if (url.pathname.startsWith("/api/v1/platform/")) {
      return handlePlatformRoutes(url, request, env);
    }

    // ── Stripe Connect endpoints (/api/v1/stripe/*)
    if (url.pathname.startsWith("/api/v1/stripe/")) {
      return handleStripeRoutes(url, request, env);
    }

    // ── Org game routes (/api/v1/orgs/:slug/*)
    const orgMatch = url.pathname.match(/^\/api\/v1\/orgs\/([a-z0-9-]+)(\/.*)?$/);
    if (orgMatch) {
      const slug = orgMatch[1];
      const subpath = orgMatch[2] || "/";
      return handleOrgRoutes(slug, subpath, url, request, env);
    }

    // ── Org lookup by join code
    if (url.pathname === "/api/v1/join" && request.method === "POST") {
      const { code } = await request.json();
      if (!code || code.length !== 6) return errorResponse("Invalid join code");
      const org = await lookupOrgByJoinCode(env.DB, code);
      if (!org) return errorResponse("Fundraiser not found", 404);
      const config = await getOrgConfig(env.DB, org.id);
      return jsonResponse({
        slug: org.slug,
        name: org.name,
        description: org.description,
        config: config || {},
      });
    }

    // ── Org search
    if (url.pathname === "/api/v1/search" && request.method === "GET") {
      const q = url.searchParams.get("q") || "";
      if (q.length < 2) return jsonResponse({ orgs: [] });
      const results = await env.DB.prepare(
        "SELECT slug, name, description FROM orgs WHERE status = 'active' AND (name LIKE ? OR slug LIKE ?) LIMIT 20"
      ).bind(`%${q}%`, `%${q}%`).all();
      return jsonResponse({ orgs: results.results });
    }

    return errorResponse("Not found", 404);
  },
};

// ─── ORG ROUTES ──────────────────────────────────────────────────────────────
// These forward requests to the per-org Durable Object

async function handleOrgRoutes(slug, subpath, url, request, env) {
  const org = await lookupOrg(env.DB, slug);
  if (!org) return errorResponse("Fundraiser not found", 404);

  const doStub = getOrgDO(env, org.id);

  // WebSocket upgrade → forward directly to DO
  if (subpath === "/ws") {
    const config = await getOrgConfig(env.DB, org.id);
    await syncOrgConfigToDO(env, org.id, config);
    return doStub.fetch(request);
  }

  // Org info (public)
  if (subpath === "/" && request.method === "GET") {
    const config = await getOrgConfig(env.DB, org.id);
    const stripe = await getOrgStripeAccount(env.DB, org.id);
    return jsonResponse({
      slug: org.slug,
      name: org.name,
      description: org.description,
      joinCode: org.join_code,
      config: config || {},
      paymentsEnabled: !!(stripe && stripe.charges_enabled),
    });
  }

  // Payment intent creation (needs Stripe account from D1)
  if (subpath === "/payment-intent" && request.method === "POST") {
    const stripe = await getOrgStripeAccount(env.DB, org.id);
    if (!stripe || !stripe.charges_enabled) {
      return errorResponse("Payments not enabled for this fundraiser", 400);
    }
    try {
      const authenticatedPlayer = await getAuthenticatedPlayer(doStub, request);
      if (!authenticatedPlayer?.displayName) {
        return errorResponse("Unauthorized", 401);
      }

      const body = await request.json();
      const purchaseType = String(body.type || "").trim();
      const spec = getPurchaseSpec(purchaseType);
      if (!spec || !spec.supported) {
        return errorResponse("This purchase type is not available in production yet");
      }

      const metadata = normalizePaymentMetadata(body.metadata || {});
      const actorName = getPurchaseActorName(purchaseType, metadata);
      if (!actorName) {
        return errorResponse("Missing purchase actor");
      }
      if (actorName.toLowerCase() !== authenticatedPlayer.displayName.toLowerCase()) {
        return errorResponse("Authenticated player does not match purchase request", 403);
      }

      await resolveFundId(env.DB, org.id, metadata.fundId || null);
      const amount = resolveExpectedAmount(purchaseType, metadata);

      // Estimate AI generation cost for types that involve Gemini API calls
      // Custom skins: ~$0.50-0.80 in Gemini tokens for a full 6-asset skin pack
      // The 10% buffer in calculateTotalFee protects against cost variance
      const AI_COST_ESTIMATES = {
        custom_skin: 80,  // 80 cents — full 6-asset skin pack via Gemini
        custom_coin: 50,  // 50 cents — single coin image with reference photo
      };
      const apiCostCents = AI_COST_ESTIMATES[purchaseType] || 0;

      const intent = await createPaymentIntent(env, {
        amount,
        description: body.description || `Fund Clicker - ${org.name}`,
        metadata: { orgId: org.id, orgSlug: org.slug, type: purchaseType, apiCostCents: String(apiCostCents), ...metadata },
        orgStripeAccountId: stripe.stripe_account_id,
        apiCostCents,
      });

      return jsonResponse({ clientSecret: intent.client_secret, id: intent.id, amount });
    } catch (error) {
      return errorResponse(error.message || "Unable to create payment intent", error.status || 400);
    }
  }

  if (subpath === "/payment-confirmation" && request.method === "POST") {
    const stripe = await getOrgStripeAccount(env.DB, org.id);
    if (!stripe || !stripe.charges_enabled) {
      return errorResponse("Payments not enabled for this fundraiser", 400);
    }

    try {
      const authenticatedPlayer = await getAuthenticatedPlayer(doStub, request);
      if (!authenticatedPlayer?.displayName) {
        return errorResponse("Unauthorized", 401);
      }

      const { paymentIntentId } = await request.json();
      if (!paymentIntentId) {
        return errorResponse("paymentIntentId is required");
      }

      const intent = await getPaymentIntent(paymentIntentId, env);
      const metadata = await validateIntentForOrg(env, org, stripe, intent);
      const actorName = getPurchaseActorName(String(metadata.type || ""), metadata);
      if (!actorName || actorName.toLowerCase() !== authenticatedPlayer.displayName.toLowerCase()) {
        return errorResponse("Authenticated player does not match payment", 403);
      }

      const result = await reconcileSuccessfulPayment(env, org, intent, stripe);
      return jsonResponse(result);
    } catch (error) {
      return errorResponse(error.message || "Unable to confirm payment", error.status || 400);
    }
  }

  // Admin routes require JWT auth
  if (subpath.startsWith("/admin/")) {
    const claims = await requireAdmin(request, env);
    if (!claims || claims.orgId !== org.id) {
      return errorResponse("Unauthorized", 401);
    }
    // Forward admin requests to DO
    const doUrl = new URL(request.url);
    doUrl.pathname = subpath;
    const doReq = new Request(doUrl, {
      method: request.method,
      headers: request.headers,
      body: request.method !== "GET" ? request.body : undefined,
    });
    const doRes = await doStub.fetch(doReq);
    const resBody = await doRes.text();
    return corsResponse(resBody, {
      status: doRes.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Forward all other org routes to DO (game API)
  const doUrl = new URL(request.url);
  doUrl.pathname = subpath;
  const doReq = new Request(doUrl, {
    method: request.method,
    headers: request.headers,
    body: request.method !== "GET" ? request.body : undefined,
  });
  const doRes = await doStub.fetch(doReq);
  const resBody = await doRes.text();
  return corsResponse(resBody, {
    status: doRes.status,
    headers: { "Content-Type": doRes.headers.get("Content-Type") || "application/json" },
  });
}

// ─── PLATFORM ROUTES ─────────────────────────────────────────────────────────
// Org registration, admin auth, org management

async function handlePlatformRoutes(url, request, env) {
  const path = url.pathname.replace("/api/v1/platform", "");

  // ── Register new org
  if (path === "/register" && request.method === "POST") {
    const body = await request.json();
    const { name, email, password } = body;

    if (!name || !email || !password) {
      return errorResponse("name, email, and password are required");
    }
    if (password.length < 8) {
      return errorResponse("Password must be at least 8 characters");
    }

    const normalizedEmail = String(email || "").trim().toLowerCase();
    const slug = body.slug || slugify(name);
    if (!isValidSlug(slug)) {
      return errorResponse("Invalid slug. Use 3-40 lowercase chars, numbers, hyphens.");
    }

    // Check slug uniqueness
    const existing = await env.DB.prepare("SELECT id FROM orgs WHERE slug = ?").bind(slug).first();
    if (existing) return errorResponse("This slug is already taken", 409);
    const existingAdmin = await env.DB.prepare("SELECT id FROM org_admins WHERE lower(email) = lower(?)").bind(normalizedEmail).first();
    if (existingAdmin) return errorResponse("An admin account with this email already exists", 409);

    const joinCode = generateJoinCode();
    const orgId = crypto.randomUUID();
    const adminId = crypto.randomUUID();
    const passwordHash = await hashPassword(password);

    // Create org + admin + default config in a batch
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO orgs (id, slug, name, join_code) VALUES (?, ?, ?, ?)"
      ).bind(orgId, slug, name, joinCode),
      env.DB.prepare(
        "INSERT INTO org_admins (id, org_id, email, password_hash, role) VALUES (?, ?, ?, ?, 'owner')"
      ).bind(adminId, orgId, normalizedEmail, passwordHash),
      env.DB.prepare(
        "INSERT INTO org_config (org_id) VALUES (?)"
      ).bind(orgId),
    ]);

    // Issue JWT
    const token = await createToken({ orgId, adminId, email: normalizedEmail, role: "owner" }, env.JWT_SECRET);

    return jsonResponse({
      org: { id: orgId, slug, name, joinCode },
      token,
    }, 201);
  }

  // ── Admin login
  if (path === "/login" && request.method === "POST") {
    const { email, password } = await request.json();
    if (!email || !password) return errorResponse("email and password required");
    const normalizedEmail = String(email).trim().toLowerCase();

    const candidates = await env.DB.prepare(
      "SELECT org_admins.*, orgs.slug, orgs.name as org_name FROM org_admins JOIN orgs ON orgs.id = org_admins.org_id WHERE lower(org_admins.email) = lower(?)"
    ).bind(normalizedEmail).all();

    const matches = [];
    for (const candidate of candidates.results || []) {
      if (await verifyPassword(password, candidate.password_hash)) {
        matches.push(candidate);
      }
    }

    if (matches.length === 0) return errorResponse("Invalid credentials", 401);
    if (matches.length > 1) {
      return errorResponse("This email is linked to multiple admin accounts. Contact support to resolve the duplicate.", 409);
    }

    const admin = matches[0];
    if (needsPasswordRehash(admin.password_hash)) {
      const upgradedHash = await hashPassword(password);
      await env.DB.prepare(
        "UPDATE org_admins SET password_hash = ? WHERE id = ?"
      ).bind(upgradedHash, admin.id).run();
      admin.password_hash = upgradedHash;
    }

    const token = await createToken({
      orgId: admin.org_id,
      adminId: admin.id,
      email: admin.email,
      role: admin.role,
    }, env.JWT_SECRET);

    return jsonResponse({
      token,
      org: { id: admin.org_id, slug: admin.slug, name: admin.org_name },
    });
  }

  // ── Get current admin + org info (requires auth)
  if (path === "/me" && request.method === "GET") {
    const claims = await requireAdmin(request, env);
    if (!claims) return errorResponse("Unauthorized", 401);

    const org = await env.DB.prepare("SELECT * FROM orgs WHERE id = ?").bind(claims.orgId).first();
    const config = await getOrgConfig(env.DB, claims.orgId);
    const stripe = await getOrgStripeAccount(env.DB, claims.orgId);

    return jsonResponse({
      admin: { id: claims.adminId, email: claims.email, role: claims.role },
      org: org ? { id: org.id, slug: org.slug, name: org.name, joinCode: org.join_code, status: org.status } : null,
      config: config || {},
      stripe: stripe ? { chargesEnabled: !!stripe.charges_enabled, onboardingComplete: !!stripe.onboarding_complete } : null,
    });
  }

  // ── Update org config (requires auth)
  if (path === "/config" && request.method === "PUT") {
    const claims = await requireAdmin(request, env);
    if (!claims) return errorResponse("Unauthorized", 401);

    try {
      const body = await request.json();
      const fields = [];
      const values = [];
      const allowed = ["coin_image_key", "primary_color", "secondary_color", "accent_color", "currency_name", "character_photos", "upgrade_names", "custom_trivia", "price_overrides"];

      for (const key of allowed) {
        if (body[key] !== undefined) {
          fields.push(`${key} = ?`);
          values.push(typeof body[key] === "object" ? JSON.stringify(body[key]) : body[key]);
        }
      }

      if (fields.length === 0) return errorResponse("No valid fields to update");

      fields.push("updated_at = datetime('now')");
      values.push(claims.orgId);

      await env.DB.prepare(
        `UPDATE org_config SET ${fields.join(", ")} WHERE org_id = ?`
      ).bind(...values).run();

      const [org, config] = await Promise.all([
        env.DB.prepare("SELECT slug FROM orgs WHERE id = ?").bind(claims.orgId).first(),
        getOrgConfig(env.DB, claims.orgId),
      ]);

      if (org) orgCache.delete(org.slug);
      await syncOrgConfigToDO(env, claims.orgId, config);

      return jsonResponse({ ok: true });
    } catch (error) {
      return errorResponse(error.message || "Unable to update config", error.status || 400);
    }
  }

  // ── Update org info (requires auth)
  if (path === "/org" && request.method === "PUT") {
    const claims = await requireAdmin(request, env);
    if (!claims) return errorResponse("Unauthorized", 401);

    const body = await request.json();
    const updates = [];
    const vals = [];

    if (body.name) { updates.push("name = ?"); vals.push(body.name); }
    if (body.description !== undefined) { updates.push("description = ?"); vals.push(body.description); }

    if (updates.length === 0) return errorResponse("Nothing to update");

    updates.push("updated_at = datetime('now')");
    vals.push(claims.orgId);

    await env.DB.prepare(
      `UPDATE orgs SET ${updates.join(", ")} WHERE id = ?`
    ).bind(...vals).run();

    return jsonResponse({ ok: true });
  }

  // ── Create a fund within the org
  if (path === "/funds" && request.method === "POST") {
    const claims = await requireAdmin(request, env);
    if (!claims) return errorResponse("Unauthorized", 401);

    const body = await request.json();
    if (!body.name) return errorResponse("Fund name is required");

    const fundSlug = slugify(body.name);
    const joinCode = generateJoinCode();
    const fundId = crypto.randomUUID();

    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO funds (id, org_id, name, slug, description, goal_cents, join_code, starts_at, ends_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(fundId, claims.orgId, body.name, fundSlug, body.description || "", body.goalCents || null, joinCode, body.startsAt || null, body.endsAt || null),
      env.DB.prepare(
        "INSERT OR IGNORE INTO fund_config (fund_id) VALUES (?)"
      ).bind(fundId),
    ]);

    return jsonResponse({
      fund: { id: fundId, slug: fundSlug, name: body.name, joinCode },
    }, 201);
  }

  // ── List funds for the org
  if (path === "/funds" && request.method === "GET") {
    const claims = await requireAdmin(request, env);
    if (!claims) return errorResponse("Unauthorized", 401);

    const funds = await env.DB.prepare(
      "SELECT * FROM funds WHERE org_id = ? ORDER BY created_at DESC"
    ).bind(claims.orgId).all();

    return jsonResponse({ funds: funds.results });
  }

  // ── Get single fund
  if (path.match(/^\/funds\/[a-z0-9-]+$/) && request.method === "GET") {
    const claims = await requireAdmin(request, env);
    if (!claims) return errorResponse("Unauthorized", 401);

    const fundSlug = path.replace("/funds/", "");
    const fund = await env.DB.prepare(
      "SELECT * FROM funds WHERE org_id = ? AND slug = ?"
    ).bind(claims.orgId, fundSlug).first();
    if (!fund) return errorResponse("Fund not found", 404);

    const config = await env.DB.prepare("SELECT * FROM fund_config WHERE fund_id = ?").bind(fund.id).first();
    const groups = await env.DB.prepare("SELECT * FROM fund_groups WHERE fund_id = ?").bind(fund.id).all();

    return jsonResponse({ fund, config, groups: groups.results });
  }

  // ── Create groups within a fund
  if (path.match(/^\/funds\/[a-z0-9-]+\/groups$/) && request.method === "POST") {
    const claims = await requireAdmin(request, env);
    if (!claims) return errorResponse("Unauthorized", 401);

    const fundSlug = path.split("/")[2];
    const fund = await env.DB.prepare(
      "SELECT id FROM funds WHERE org_id = ? AND slug = ?"
    ).bind(claims.orgId, fundSlug).first();
    if (!fund) return errorResponse("Fund not found", 404);

    const body = await request.json();
    if (!body.name) return errorResponse("Group name required");

    const groupId = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO fund_groups (id, fund_id, name, color) VALUES (?, ?, ?, ?)"
    ).bind(groupId, fund.id, body.name, body.color || "#FFD700").run();

    return jsonResponse({ group: { id: groupId, name: body.name, color: body.color || "#FFD700" } }, 201);
  }

  // ── Dashboard: org-level analytics
  if (path === "/dashboard" && request.method === "GET") {
    const claims = await requireAdmin(request, env);
    if (!claims) return errorResponse("Unauthorized", 401);

    const days = parseInt(url.searchParams.get("days") || "30", 10);
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

    const [stats, txSummary, funds, recentTx] = await Promise.all([
      env.DB.prepare(
        `SELECT date, SUM(active_players) as players, SUM(gross_revenue_cents) as revenue,
         SUM(total_clicks) as clicks, SUM(battles_played) as battles
         FROM daily_stats WHERE org_id = ? AND date >= ? GROUP BY date ORDER BY date`
      ).bind(claims.orgId, since).all(),

      env.DB.prepare(
        `SELECT COUNT(*) as count, SUM(amount_cents) as gross, SUM(platform_fee_cents) as fees,
         SUM(net_cents) as net FROM transactions WHERE org_id = ? AND created_at >= ?`
      ).bind(claims.orgId, since).first(),

      env.DB.prepare(
        "SELECT id, name, slug, status, join_code, goal_cents, created_at FROM funds WHERE org_id = ? ORDER BY created_at DESC LIMIT 50"
      ).bind(claims.orgId).all(),

      env.DB.prepare(
        "SELECT * FROM transactions WHERE org_id = ? ORDER BY created_at DESC LIMIT 20"
      ).bind(claims.orgId).all(),
    ]);

    return jsonResponse({
      dailyStats: stats.results,
      summary: txSummary || { count: 0, gross: 0, fees: 0, net: 0 },
      funds: funds.results,
      recentTransactions: recentTx.results,
    });
  }

  // ── Platform-wide analytics (for superadmins — future)
  if (path === "/platform-stats" && request.method === "GET") {
    const claims = await requireAdmin(request, env);
    if (!claims) return errorResponse("Unauthorized", 401);
    if (claims.role !== "superadmin") return errorResponse("Forbidden", 403);

    const [orgCount, playerCount, txSummary] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) as count FROM orgs").first(),
      env.DB.prepare("SELECT COUNT(*) as count FROM players").first(),
      env.DB.prepare("SELECT COUNT(*) as count, SUM(amount_cents) as gross, SUM(platform_fee_cents) as fees FROM transactions WHERE status = 'succeeded'").first(),
    ]);

    return jsonResponse({
      orgs: orgCount?.count || 0,
      players: playerCount?.count || 0,
      transactions: txSummary?.count || 0,
      grossRevenue: txSummary?.gross || 0,
      platformFees: txSummary?.fees || 0,
    });
  }

  // ── Payout config
  if (path === "/payouts" && request.method === "GET") {
    const claims = await requireAdmin(request, env);
    if (!claims) return errorResponse("Unauthorized", 401);

    let config = await env.DB.prepare("SELECT * FROM payout_config WHERE org_id = ?").bind(claims.orgId).first();
    if (!config) {
      config = { payout_schedule: "weekly", minimum_payout_cents: 1000, payout_method: "stripe", notification_email: null };
    }
    return jsonResponse(config);
  }

  if (path === "/payouts" && request.method === "PUT") {
    const claims = await requireAdmin(request, env);
    if (!claims) return errorResponse("Unauthorized", 401);

    const body = await request.json();
    await env.DB.prepare(
      `INSERT INTO payout_config (org_id, payout_schedule, minimum_payout_cents, payout_method, notification_email)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(org_id) DO UPDATE SET
         payout_schedule = excluded.payout_schedule,
         minimum_payout_cents = excluded.minimum_payout_cents,
         payout_method = excluded.payout_method,
         notification_email = excluded.notification_email,
         updated_at = datetime('now')`
    ).bind(
      claims.orgId,
      body.payoutSchedule || "weekly",
      body.minimumPayoutCents || 1000,
      body.payoutMethod || "stripe",
      body.notificationEmail || null
    ).run();

    return jsonResponse({ ok: true });
  }

  // ── Invite another admin
  if (path === "/invite" && request.method === "POST") {
    const claims = await requireAdmin(request, env);
    if (!claims || claims.role !== "owner") return errorResponse("Only owners can invite admins", 403);

    const body = await request.json();
    if (!body.email) return errorResponse("Email required");
    const normalizedEmail = String(body.email).trim().toLowerCase();
    const existingAdmin = await env.DB.prepare(
      "SELECT id FROM org_admins WHERE lower(email) = lower(?)"
    ).bind(normalizedEmail).first();
    if (existingAdmin) return errorResponse("An admin account with this email already exists", 409);

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();

    await env.DB.prepare(
      "INSERT INTO org_invitations (id, org_id, email, role, token, expires_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(crypto.randomUUID(), claims.orgId, normalizedEmail, body.role || "admin", token, expiresAt).run();

    return jsonResponse({ ok: true, token, expiresAt });
  }

  return errorResponse("Not found", 404);
}

// ─── STRIPE CONNECT ROUTES ──────────────────────────────────────────────────

async function handleStripeRoutes(url, request, env) {
  const path = url.pathname.replace("/api/v1/stripe", "");

  // ── Get Connect OAuth URL
  if (path === "/connect" && request.method === "POST") {
    const claims = await requireAdmin(request, env);
    if (!claims) return errorResponse("Unauthorized", 401);

    const org = await env.DB.prepare("SELECT slug FROM orgs WHERE id = ?").bind(claims.orgId).first();
    if (!org) return errorResponse("Org not found", 404);

    const oauthUrl = getConnectOAuthURL(env, claims.orgId, org.slug);
    return jsonResponse({ url: oauthUrl });
  }

  // ── OAuth callback (Stripe redirects here after org authorizes)
  if (path === "/callback" && request.method === "POST") {
    const { code, state: orgId } = await request.json();
    if (!code || !orgId) return errorResponse("Missing code or state");

    // Verify the requester owns this org
    const claims = await requireAdmin(request, env);
    if (!claims || claims.orgId !== orgId) return errorResponse("Unauthorized", 401);

    const result = await exchangeOAuthCode(code, env);

    // Check account status
    const status = await getAccountStatus(result.stripeAccountId, env);

    // Save to D1
    await env.DB.prepare(
      `INSERT INTO stripe_accounts (org_id, stripe_account_id, charges_enabled, onboarding_complete)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(org_id) DO UPDATE SET
         stripe_account_id = excluded.stripe_account_id,
         charges_enabled = excluded.charges_enabled,
         onboarding_complete = excluded.onboarding_complete,
         updated_at = datetime('now')`
    ).bind(orgId, result.stripeAccountId, status.chargesEnabled ? 1 : 0, status.detailsSubmitted ? 1 : 0).run();

    return jsonResponse({
      ok: true,
      chargesEnabled: status.chargesEnabled,
      onboardingComplete: status.detailsSubmitted,
    });
  }

  // ── Webhook handler (Stripe sends events here)
  if (path === "/webhook" && request.method === "POST") {
    try {
      const body = await request.text();
      const sig = request.headers.get("Stripe-Signature") || "";

      if (env.STRIPE_WEBHOOK_SECRET) {
        const valid = await verifyWebhookSignature(body, sig, env.STRIPE_WEBHOOK_SECRET);
        if (!valid) return errorResponse("Invalid signature", 400);
      }

      const event = JSON.parse(body);

      if (event.type === "account.updated") {
        const account = event.data.object;
        await env.DB.prepare(
          `UPDATE stripe_accounts SET charges_enabled = ?, onboarding_complete = ?, updated_at = datetime('now')
           WHERE stripe_account_id = ?`
        ).bind(
          account.charges_enabled ? 1 : 0,
          account.details_submitted ? 1 : 0,
          account.id
        ).run();
        return jsonResponse({ received: true });
      }

      if (event.type === "payment_intent.succeeded" || event.type === "payment_intent.payment_failed") {
        const intent = event.data.object;
        const org = await lookupOrgForIntent(env.DB, intent);
        if (!org) {
          throw new ValidationError("Unable to resolve fundraiser for payment intent", 404);
        }

        const stripe = await getOrgStripeAccount(env.DB, org.id);
        if (!stripe) {
          throw new ValidationError("Stripe account not found for fundraiser", 404);
        }

        if (event.type === "payment_intent.succeeded") {
          try {
            await reconcileSuccessfulPayment(env, org, intent, stripe);
          } catch (error) {
            if (error.permanent) {
              await recordFailedPayment(env, org, intent, stripe).catch(() => {});
              return jsonResponse({ received: true, dropped: true, reason: error.message });
            }
            throw error;
          }
        } else {
          await recordFailedPayment(env, org, intent, stripe);
        }
      }

      return jsonResponse({ received: true });
    } catch (error) {
      return errorResponse(error.message || "Webhook handling failed", error.status || 500);
    }
  }

  return errorResponse("Not found", 404);
}
