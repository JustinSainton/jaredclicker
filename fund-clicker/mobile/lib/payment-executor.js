// Web payment executor — uses Stripe.js redirect to Checkout
// For MVP: redirects to Stripe Checkout. Can be enhanced with embedded Elements later.
import { loadStripe } from "@stripe/stripe-js";

let stripePromise = null;

function getStripe() {
  if (!stripePromise) {
    const key = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";
    if (key && !key.includes("placeholder")) {
      stripePromise = loadStripe(key);
    }
  }
  return stripePromise;
}

export async function executePayment(stripe, clientSecret, { description }) {
  const stripeJs = await getStripe();

  if (!stripeJs || !clientSecret) {
    return { success: false, error: "Payments not available on web yet. Use the mobile app for purchases." };
  }

  // Use Stripe.js confirmCardPayment with redirect
  // For MVP, we open a new window with Stripe Checkout
  try {
    const result = await stripeJs.confirmCardPayment(clientSecret, {
      payment_method: {
        card: { token: "tok_visa" }, // This would normally come from Stripe Elements
      },
    });

    if (result.error) {
      if (result.error.type === "card_error" || result.error.type === "validation_error") {
        return { success: false, error: result.error.message };
      }
      throw new Error(result.error.message);
    }

    if (result.paymentIntent?.status === "succeeded") {
      return { success: true };
    }

    return { success: false, error: "Payment was not completed" };
  } catch (e) {
    // For now, show a message directing to the mobile app
    return {
      success: false,
      error: "Web payments coming soon. Use the Fund Clicker app for purchases.",
    };
  }
}
