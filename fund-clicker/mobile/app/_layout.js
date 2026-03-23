// Root layout — wraps entire app with providers
// StripeProvider is platform-split: native uses @stripe/stripe-react-native,
// web uses a no-op wrapper. See lib/stripe-provider.{native,web}.js
import { Stack } from "expo-router";
import { OrgProvider } from "../context/OrgContext";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { AppState } from "react-native";
import { initSounds } from "../lib/sounds";
import { forceSave } from "../hooks/useGameState";
import { StripeProvider, isStripeAvailable } from "../lib/stripe-provider";

const STRIPE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || "pk_test_placeholder";

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

  if (isStripeAvailable && STRIPE_PUBLISHABLE_KEY && !STRIPE_PUBLISHABLE_KEY.includes("placeholder")) {
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
