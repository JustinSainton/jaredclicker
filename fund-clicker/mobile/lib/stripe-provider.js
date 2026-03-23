// Web fallback — no Stripe provider
// This file is loaded on web (Metro skips .native.js on web builds)
export const StripeProvider = ({ children }) => children;
export const isStripeAvailable = false;
