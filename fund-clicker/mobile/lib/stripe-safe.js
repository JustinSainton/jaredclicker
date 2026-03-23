// Web fallback — Stripe not available
// On web, useStripeSafe returns null. Payment UIs should check and show a fallback.
export function useStripeSafe() {
  return null;
}
