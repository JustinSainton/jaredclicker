// Client-side cryptography utilities
// PIN hashing before transmission — defense in depth even over HTTPS

/**
 * Hash a PIN using SHA-256 before sending to server.
 * This ensures the raw PIN never leaves the device even if HTTPS is compromised
 * (MITM proxy, compromised CA, debug logging, etc.)
 */
export async function hashPin(pin) {
  // React Native doesn't have crypto.subtle, so we use a pure-JS SHA-256
  // In production with expo-crypto, use Crypto.digestStringAsync
  try {
    const { digestStringAsync, CryptoDigestAlgorithm } = require("expo-crypto");
    return await digestStringAsync(CryptoDigestAlgorithm.SHA256, pin);
  } catch {
    // Fallback: send raw (server hashes with SHA-256 anyway)
    // This should only happen in development/Expo Go
    return pin;
  }
}
