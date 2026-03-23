// Root layout — wraps entire app with providers
// StripeProvider is conditional: only rendered with a real publishable key.
// Without Stripe, payments are disabled but everything else works.
import { Stack } from "expo-router";
import { OrgProvider } from "../context/OrgContext";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import { initSounds } from "../lib/sounds";
import { forceSave } from "../hooks/useGameState";

// Stripe is optional — only load if publishable key is set
const STRIPE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";

// Conditionally import Stripe to avoid crash on web or when key is missing
let StripeProvider = null;
if (Platform.OS !== "web" && STRIPE_PUBLISHABLE_KEY && !STRIPE_PUBLISHABLE_KEY.includes("placeholder")) {
  try {
    const stripe = require("@stripe/stripe-react-native");
    StripeProvider = stripe.StripeProvider;
  } catch {
    // Stripe SDK not available — payments disabled
  }
}

function AppContent() {
  return (
    <OrgProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#1a1a2e" },
          animation: "slide_from_right",
        }}
      />
    </OrgProvider>
  );
}

export default function RootLayout() {
  useEffect(() => {
    initSounds();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background" || state === "inactive") {
        forceSave();
      }
    });
    return () => sub?.remove();
  }, []);

  // Wrap with StripeProvider only if available and configured
  if (StripeProvider) {
    return (
      <StripeProvider
        publishableKey={STRIPE_PUBLISHABLE_KEY}
        merchantIdentifier="merchant.com.fundclicker.app"
        urlScheme="fundclicker"
      >
        <AppContent />
      </StripeProvider>
    );
  }

  return <AppContent />;
}
