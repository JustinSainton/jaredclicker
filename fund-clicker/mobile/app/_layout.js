// Root layout — wraps entire app with providers
// Order: StripeProvider → OrgProvider → (screens)
import { Stack } from "expo-router";
import { StripeProvider } from "@stripe/stripe-react-native";
import { OrgProvider } from "../context/OrgContext";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { AppState } from "react-native";
import { initSounds } from "../lib/sounds";
import { forceSave } from "../hooks/useGameState";

// Stripe publishable key — this is the PLATFORM's key (not per-org)
// Set EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY in EAS env vars for production.
// Falls back to a placeholder that disables Stripe gracefully.
const STRIPE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || "pk_test_placeholder";

export default function RootLayout() {
  // Initialize sounds on app start
  useEffect(() => {
    initSounds();
  }, []);

  // Save game state when app goes to background
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background" || state === "inactive") {
        forceSave();
      }
    });
    return () => sub?.remove();
  }, []);

  return (
    <StripeProvider
      publishableKey={STRIPE_PUBLISHABLE_KEY}
      merchantIdentifier="merchant.com.fundclicker.app"
      urlScheme="fundclicker"
    >
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
    </StripeProvider>
  );
}
