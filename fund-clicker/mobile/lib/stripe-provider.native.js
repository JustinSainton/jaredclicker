// Native-only Stripe provider
// This file is only loaded on iOS/Android (Metro resolves .native.js first)
export { StripeProvider } from "@stripe/stripe-react-native";
export const isStripeAvailable = true;
