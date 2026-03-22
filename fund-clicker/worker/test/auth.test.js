import assert from "node:assert/strict";
import test from "node:test";

import { hashPassword, verifyPassword, needsPasswordRehash } from "../src/auth.js";

test("hashPassword produces PBKDF2 hashes that verify", async () => {
  const hash = await hashPassword("correct horse battery staple");

  assert.equal(hash.startsWith("pbkdf2_sha256$"), true);
  assert.equal(await verifyPassword("correct horse battery staple", hash), true);
  assert.equal(await verifyPassword("wrong password", hash), false);
  assert.equal(needsPasswordRehash(hash), false);
});

test("verifyPassword accepts legacy SHA-256 hashes and marks them for rehash", async () => {
  const legacyHash = "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8";

  assert.equal(await verifyPassword("password", legacyHash), true);
  assert.equal(await verifyPassword("not-password", legacyHash), false);
  assert.equal(needsPasswordRehash(legacyHash), true);
});
