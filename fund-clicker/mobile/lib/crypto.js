// Client-side cryptography utilities
// PIN hashing before transmission — defense in depth even over HTTPS
import { Platform } from "react-native";

/**
 * Hash a PIN using SHA-256 before sending to server.
 * Web: uses native crypto.subtle (available in all modern browsers)
 * Native: uses expo-crypto
 * Fallback: sends raw (server hashes anyway)
 */
export async function hashPin(pin) {
  // Web: use native Web Crypto API
  if (Platform.OS === "web" && typeof crypto !== "undefined" && crypto.subtle) {
    try {
      const data = new TextEncoder().encode(pin);
      const buf = await crypto.subtle.digest("SHA-256", data);
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
    } catch {
      return pin;
    }
  }

  // Native: use expo-crypto
  try {
    const { digestStringAsync, CryptoDigestAlgorithm } = require("expo-crypto");
    return await digestStringAsync(CryptoDigestAlgorithm.SHA256, pin);
  } catch {
    return pin;
  }
}
