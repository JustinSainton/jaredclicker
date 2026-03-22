import assert from "node:assert/strict";
import test from "node:test";

import {
  ValidationError,
  normalizePaymentMetadata,
  getPurchaseActorName,
  resolveExpectedAmount,
} from "../src/index.js";

test("normalizePaymentMetadata stringifies Stripe metadata values", () => {
  assert.deepEqual(
    normalizePaymentMetadata({ credits: 3, playerName: "Alice", nullable: null }),
    { credits: "3", playerName: "Alice", nullable: "" }
  );
});

test("resolveExpectedAmount enforces server-side prices", () => {
  assert.equal(resolveExpectedAmount("sabotage_credits", { credits: "1" }), 99);
  assert.equal(resolveExpectedAmount("coin_cut", { percentage: "40", targetName: "Bob" }), 1999);
  assert.equal(resolveExpectedAmount("break_free", { playerName: "Alice" }), 99);
  assert.equal(resolveExpectedAmount("skin_purchase", { skinId: "diamond" }), 999);
});

test("resolveExpectedAmount rejects unsupported or malformed purchases", () => {
  assert.throws(
    () => resolveExpectedAmount("coin_cut_campaign", { campaignId: "camp_1" }),
    ValidationError
  );
  assert.throws(
    () => resolveExpectedAmount("coin_cut", { percentage: "10" }),
    ValidationError
  );
  assert.throws(
    () => resolveExpectedAmount("skin_purchase", { skinId: "unknown" }),
    ValidationError
  );
});

test("getPurchaseActorName binds entitlements to the correct player field", () => {
  assert.equal(getPurchaseActorName("sabotage_credits", { playerName: "Alice" }), "Alice");
  assert.equal(getPurchaseActorName("coin_cut", { attackerName: "Mallory", targetName: "Bob" }), "Mallory");
  assert.equal(getPurchaseActorName("coin_cut_campaign", { contributorName: "Eve" }), "Eve");
});
