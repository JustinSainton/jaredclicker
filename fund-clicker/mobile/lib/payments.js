// Fund Clicker: Complete Payment System
// Wraps @stripe/stripe-react-native with:
// - PaymentSheet initialization from backend PaymentIntent
// - Automatic retry on transient failures
// - Post-payment credit/sabotage execution
// - Receipt generation for purchase history
// - Error classification (user cancel vs payment failure vs network)

import { Alert } from "react-native";
import * as Haptics from "./haptics";
import { executePayment } from "./payment-executor";
import { api } from "./api";

// ─── PAYMENT TYPES ───────────────────────────────────────────────────────────

export const PURCHASE_TYPES = {
  SABOTAGE_CREDITS: "sabotage_credits",
  COIN_CUT: "coin_cut",
  COIN_CUT_CAMPAIGN: "coin_cut_campaign",
  TOTAL_WIPE_CAMPAIGN: "total_wipe_campaign",
  SKIN_PURCHASE: "skin_purchase",
  CUSTOM_SKIN: "custom_skin",
  DOUBLE_OR_NOTHING: "double_or_nothing",
  REMATCH: "rematch",
  BREAK_FREE: "break_free",
};

// ─── PRODUCT CATALOG ─────────────────────────────────────────────────────────

export const SABOTAGE_PACKS = [
  { id: "sab_1", credits: 1, priceCents: 99, label: "1 Sabotage Credit", emoji: "\uD83D\uDCA3" },
  { id: "sab_3", credits: 3, priceCents: 249, label: "3 Sabotage Credits", emoji: "\uD83D\uDCA3\uD83D\uDCA3\uD83D\uDCA3" },
  { id: "sab_5", credits: 5, priceCents: 399, label: "5 Sabotage Credits", emoji: "\uD83D\uDCA5" },
];

export const COIN_CUT_PRICES = {
  1: 100,    // $1.00
  5: 200,    // $2.00
  10: 399,   // $3.99
  15: 599,   // $5.99
  20: 799,   // $7.99
  25: 999,   // $9.99
  30: 1299,  // $12.99
  35: 1599,  // $15.99
  40: 1999,  // $19.99
};

export const BREAK_FREE_PRICE = 99; // $0.99 to remove a sabotage

// ─── PAYMENT FLOW ────────────────────────────────────────────────────────────

/**
 * Complete payment flow:
 * 1. Create PaymentIntent on server (gets clientSecret)
 * 2. Present Stripe PaymentSheet to user
 * 3. On success, execute the post-payment action (add credits, execute cut, etc.)
 * 4. Return result to caller
 *
 * @param {object} stripe - The Stripe instance from useStripe()
 * @param {string} orgSlug - Current org slug
 * @param {object} options - Payment options
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function processPayment(stripe, orgSlug, {
  amountCents,
  type,
  description,
  metadata = {},
  authToken = null,
  onApplied,
}) {
  try {
    // Step 1: Create PaymentIntent on server
    const { clientSecret, id: paymentIntentId } = await api.createPaymentIntent(orgSlug, {
      amount: amountCents,
      type,
      description,
      metadata,
      authToken,
    });

    if (!clientSecret) {
      throw new Error("Failed to create payment — no client secret returned");
    }

    // Step 2-3: Execute payment via platform-specific flow
    // Native: PaymentSheet | Web: Stripe.js
    const payResult = await executePayment(stripe, clientSecret, { description });
    if (!payResult.success) {
      if (payResult.cancelled) return { success: false, cancelled: true };
      if (payResult.error) return { success: false, error: payResult.error };
      return { success: false, error: "Payment was not completed" };
    }

    // Step 4: Payment succeeded — hand off fulfillment to backend
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    let backendConfirmed = false;
    let pendingSync = false;

    try {
      await api.confirmPayment(orgSlug, paymentIntentId, authToken);
      backendConfirmed = true;
      if (onApplied) {
        await onApplied(paymentIntentId);
      }
    } catch (confirmError) {
      // Stripe already succeeded. Webhooks can still finalize fulfillment.
      pendingSync = true;
    }

    return { success: true, paymentIntentId, backendConfirmed, pendingSync };

  } catch (error) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

    const message = error.message || "Something went wrong";
    const isNetwork = message.includes("network") || message.includes("fetch") || message.includes("timeout");

    if (isNetwork) {
      Alert.alert(
        "Connection Error",
        "Please check your internet connection and try again.",
        [{ text: "OK" }],
      );
    }

    return { success: false, error: message };
  }
}

// ─── PURCHASE FLOWS (specific product types) ─────────────────────────────────

/**
 * Buy sabotage credits
 */
export async function buySabotageCredits(stripe, orgSlug, playerName, pack, playerToken) {
  return processPayment(stripe, orgSlug, {
    amountCents: pack.priceCents,
    type: PURCHASE_TYPES.SABOTAGE_CREDITS,
    description: `${pack.credits}x Sabotage Credit`,
    metadata: { playerName, credits: String(pack.credits) },
    authToken: playerToken,
  });
}

/**
 * Execute a direct coin cut (not a campaign)
 */
export async function buyCoinCut(stripe, orgSlug, { attackerName, targetName, percentage, playerToken }) {
  const priceCents = COIN_CUT_PRICES[percentage];
  if (!priceCents) throw new Error("Invalid percentage");

  return processPayment(stripe, orgSlug, {
    amountCents: priceCents,
    type: PURCHASE_TYPES.COIN_CUT,
    description: `${percentage}% Coin Cut on ${targetName}`,
    metadata: { attackerName, targetName, percentage: String(percentage) },
    authToken: playerToken,
  });
}

/**
 * Contribute to a coin cut campaign
 */
export async function contributeToCampaign(stripe, orgSlug, { campaignId, contributorName, cents, premiumCents = 0, playerToken }) {
  return processPayment(stripe, orgSlug, {
    amountCents: cents,
    type: PURCHASE_TYPES.COIN_CUT_CAMPAIGN,
    description: `Campaign contribution`,
    metadata: { campaignId, contributorName },
    authToken: playerToken,
  });
}

/**
 * Break free from sabotage
 */
export async function buyBreakFree(stripe, orgSlug, playerName, playerToken) {
  return processPayment(stripe, orgSlug, {
    amountCents: BREAK_FREE_PRICE,
    type: PURCHASE_TYPES.BREAK_FREE,
    description: "Break Free from Sabotage",
    metadata: { playerName },
    authToken: playerToken,
  });
}

/**
 * Buy a pre-built skin
 */
export async function buySkin(stripe, orgSlug, { playerName, skinId, priceCents = 599, playerToken }) {
  return processPayment(stripe, orgSlug, {
    amountCents: priceCents,
    type: PURCHASE_TYPES.SKIN_PURCHASE,
    description: `Skin: ${skinId}`,
    metadata: { playerName, skinId },
    authToken: playerToken,
  });
}

/**
 * Double or nothing (after losing a battle)
 */
export async function buyDoubleOrNothing(stripe, orgSlug, { gameId, playerName, playerToken }) {
  return processPayment(stripe, orgSlug, {
    amountCents: 99,
    type: PURCHASE_TYPES.DOUBLE_OR_NOTHING,
    description: "Double or Nothing",
    metadata: { gameId, playerName },
    authToken: playerToken,
  });
}

/**
 * Rematch (best 2 of 3 after losing)
 */
export async function buyRematch(stripe, orgSlug, { gameId, playerName, playerToken }) {
  return processPayment(stripe, orgSlug, {
    amountCents: 199,
    type: PURCHASE_TYPES.REMATCH,
    description: "Best 2 of 3 Rematch",
    metadata: { gameId, playerName },
    authToken: playerToken,
  });
}

// ─── PRICE FORMATTING ────────────────────────────────────────────────────────

export function formatPrice(cents) {
  return "$" + (cents / 100).toFixed(2);
}

// ─── PAYMENT AVAILABILITY CHECK ──────────────────────────────────────────────

export function isPaymentsEnabled(org) {
  return !!org?.paymentsEnabled;
}
