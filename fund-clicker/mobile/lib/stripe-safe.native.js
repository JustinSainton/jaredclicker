// Native Stripe hook — delegates to @stripe/stripe-react-native
import { useStripe } from "@stripe/stripe-react-native";

export function useStripeSafe() {
  try {
    return useStripe();
  } catch {
    return null;
  }
}
