// JWT-based auth for org admins + lightweight player device auth

const ALGORITHM = { name: "HMAC", hash: "SHA-256" };
const TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const PASSWORD_HASH_PREFIX = "pbkdf2_sha256";
const PASSWORD_HASH_ITERATIONS = 100000; // CF Workers limit: max 100K iterations
const PASSWORD_HASH_BYTES = 32;

// Import a secret string as a CryptoKey for HMAC signing
async function getSigningKey(secret) {
  const enc = new TextEncoder();
  return crypto.subtle.importKey("raw", enc.encode(secret), ALGORITHM, false, ["sign", "verify"]);
}

// Base64url encode/decode (no padding, URL-safe)
function b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return Uint8Array.from(atob(str), c => c.charCodeAt(0));
}

// Create a JWT
export async function createToken(payload, secret) {
  const key = await getSigningKey(secret);
  const header = { alg: "HS256", typ: "JWT" };
  const now = Date.now();
  const claims = { ...payload, iat: now, exp: now + TOKEN_EXPIRY_MS };

  const enc = new TextEncoder();
  const headerB64 = b64url(enc.encode(JSON.stringify(header)));
  const payloadB64 = b64url(enc.encode(JSON.stringify(claims)));
  const signingInput = headerB64 + "." + payloadB64;

  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(signingInput));
  return signingInput + "." + b64url(sig);
}

// Verify and decode a JWT. Returns payload or null.
export async function verifyToken(token, secret) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const key = await getSigningKey(secret);
    const enc = new TextEncoder();
    const signingInput = parts[0] + "." + parts[1];
    const sig = b64urlDecode(parts[2]);

    const valid = await crypto.subtle.verify("HMAC", key, sig, enc.encode(signingInput));
    if (!valid) return null;

    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1])));
    if (payload.exp && payload.exp < Date.now()) return null;

    return payload;
  } catch {
    return null;
  }
}

async function hashPasswordLegacy(password) {
  const data = new TextEncoder().encode(password);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function safeEqualBytes(a, b) {
  const left = a instanceof Uint8Array ? a : new Uint8Array(a || []);
  const right = b instanceof Uint8Array ? b : new Uint8Array(b || []);
  const length = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let i = 0; i < length; i++) {
    diff |= (left[i] || 0) ^ (right[i] || 0);
  }
  return diff === 0;
}

async function derivePasswordBytes(password, salt, iterations = PASSWORD_HASH_ITERATIONS) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations,
    },
    key,
    PASSWORD_HASH_BYTES * 8
  );
  return new Uint8Array(derived);
}

// Hash a password with PBKDF2 for storage in D1/DO.
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await derivePasswordBytes(password, salt);
  return `${PASSWORD_HASH_PREFIX}$${PASSWORD_HASH_ITERATIONS}$${b64url(salt)}$${b64url(derived)}`;
}

export async function verifyPassword(password, storedHash) {
  if (!storedHash) return false;

  if (storedHash.startsWith(`${PASSWORD_HASH_PREFIX}$`)) {
    const [, iterationText, saltText, hashText] = storedHash.split("$");
    const iterations = Number(iterationText);
    if (!iterations || !saltText || !hashText) return false;
    const derived = await derivePasswordBytes(password, b64urlDecode(saltText), iterations);
    return safeEqualBytes(derived, b64urlDecode(hashText));
  }

  const legacy = await hashPasswordLegacy(password);
  return safeEqualBytes(new TextEncoder().encode(legacy), new TextEncoder().encode(storedHash));
}

export function needsPasswordRehash(storedHash) {
  return !String(storedHash || "").startsWith(`${PASSWORD_HASH_PREFIX}$`);
}

// Extract bearer token from Authorization header
export function extractBearer(request) {
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

// Middleware: verify admin JWT and attach claims to request
export async function requireAdmin(request, env) {
  const token = extractBearer(request);
  if (!token) return null;
  const claims = await verifyToken(token, env.JWT_SECRET);
  if (!claims || !claims.orgId || !claims.role) return null;
  return claims; // { orgId, adminId, email, role }
}

// Generate a 6-character alphanumeric join code (uppercase, no confusing chars)
export function generateJoinCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes).map(b => chars[b % chars.length]).join("");
}

// Validate org slug: lowercase alphanumeric + hyphens, 3-40 chars
export function isValidSlug(slug) {
  return /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug);
}

// Slugify a name
export function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}
