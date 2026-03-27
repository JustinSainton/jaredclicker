// Native payment executor — uses Stripe PaymentSheet
import * as Haptics from "./haptics";

export async function executePayment(stripe, clientSecret, { description, returnURL }) {
  if (!stripe) {
    return { success: false, error: "Payments not available" };
  }

  // Initialize PaymentSheet
  const { error: initError } = await stripe.initPaymentSheet({
    paymentIntentClientSecret: clientSecret,
    merchantDisplayName: "Fund Clicker",
    applePay: { merchantCountryCode: "US" },
    googlePay: { merchantCountryCode: "US", testEnv: false },
    style: "alwaysDark",
    appearance: {
      colors: {
        primary: "#8b5cf6",
        background: "#16213e",
        componentBackground: "#1a1a2e",
        componentText: "#ffffff",
        secondaryText: "#a1a1aa",
        placeholderText: "#71717a",
        icon: "#a78bfa",
      },
      shapes: { borderRadius: 12, borderWidth: 1 },
    },
    returnURL: returnURL || "fundclicker://payment-complete",
  });

  if (initError) {
    throw new Error(initError.message || "Failed to initialize payment");
  }

  // Present PaymentSheet
  const { error: presentError } = await stripe.presentPaymentSheet();

  if (presentError) {
    if (presentError.code === "Canceled") {
      return { success: false, cancelled: true };
    }
    throw new Error(presentError.message || "Payment failed");
  }

  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  return { success: true };
}
