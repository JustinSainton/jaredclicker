// Safe Stripe hook wrapper — returns null if StripeProvider is not available
// This prevents crashes when Stripe SDK isn't configured (no publishable key,
// web platform, or during development without Stripe setup).
import { Platform } from "react-native";

let _useStripe = null;

try {
  if (Platform.OS !== "web") {
    const stripe = require("@stripe/stripe-react-native");
    _useStripe = stripe.useStripe;
  }
} catch {
  // Stripe not available
}

/**
 * Safe wrapper for useStripe(). Returns the Stripe instance or null.
 * Components should check: `if (!stripe) { /* show "payments not available" */ }`
 */
export function useStripeSafe() {
  if (!_useStripe) return null;
  try {
    return _useStripe();
  } catch {
    // StripeProvider not in tree — Stripe not configured
    return null;
  }
}
