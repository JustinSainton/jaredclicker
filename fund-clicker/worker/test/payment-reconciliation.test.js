import assert from "node:assert/strict";
import test from "node:test";

import { reconcileSuccessfulPayment } from "../src/index.js";

class FakeStatement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql.replace(/\s+/g, " ").trim();
    this.args = [];
  }

  bind(...args) {
    this.args = args;
    return this;
  }

  async first() {
    return this.db.first(this.sql, this.args);
  }

  async run() {
    return this.db.run(this.sql, this.args);
  }
}

class FakeD1 {
  constructor() {
    this.transactions = [];
    this.dailyStats = [];
  }

  prepare(sql) {
    return new FakeStatement(this, sql);
  }

  async batch(statements) {
    for (const statement of statements) {
      await statement.run();
    }
    return [];
  }

  first(sql, args) {
    if (sql.startsWith("SELECT status FROM transactions")) {
      const row = this.transactions.find((item) => item.stripe_payment_intent_id === args[0]);
      return row ? { status: row.status } : null;
    }

    if (sql.startsWith("SELECT COUNT(*) as transactionCount")) {
      const [orgId] = args;
      const rows = this.transactions.filter((item) => item.org_id === orgId && item.status === "succeeded");
      return {
        transactionCount: rows.length,
        totalRaisedCents: rows.reduce((sum, row) => sum + row.amount_cents, 0),
      };
    }

    if (sql.startsWith("SELECT id FROM funds")) {
      return null;
    }

    throw new Error(`Unhandled first query: ${sql}`);
  }

  run(sql, args) {
    if (sql.startsWith("INSERT INTO transactions")) {
      const [
        orgId,
        fundId,
        paymentIntentId,
        amountCents,
        platformFeeCents,
        stripeFeeCents,
        netCents,
        type,
        playerName,
        metadata,
      ] = args;

      this.transactions.push({
        org_id: orgId,
        fund_id: fundId,
        stripe_payment_intent_id: paymentIntentId,
        amount_cents: amountCents,
        platform_fee_cents: platformFeeCents,
        stripe_fee_cents: stripeFeeCents,
        net_cents: netCents,
        type,
        player_name: playerName,
        metadata,
        status: sql.includes("'pending'") ? "pending" : "failed",
      });
      return { success: true };
    }

    if (sql.startsWith("UPDATE transactions")) {
      const paymentIntentId = args[args.length - 1];
      const row = this.transactions.find((item) => item.stripe_payment_intent_id === paymentIntentId);
      if (!row) throw new Error(`Unknown transaction ${paymentIntentId}`);

      if (sql.includes("status = 'pending'")) {
        const [
          orgId,
          fundId,
          amountCents,
          platformFeeCents,
          stripeFeeCents,
          netCents,
          type,
          playerName,
          metadata,
        ] = args;

        Object.assign(row, {
          org_id: orgId,
          fund_id: fundId,
          amount_cents: amountCents,
          platform_fee_cents: platformFeeCents,
          stripe_fee_cents: stripeFeeCents,
          net_cents: netCents,
          type,
          player_name: playerName,
          metadata,
          status: "pending",
        });
        return { success: true };
      }

      if (sql.includes("status = 'succeeded'")) {
        const [metadata] = args;
        row.metadata = metadata;
        row.status = "succeeded";
        return { success: true };
      }

      if (sql.includes("status = 'failed'")) {
        const [metadata] = args;
        if (row.status !== "succeeded") {
          row.metadata = metadata;
          row.status = "failed";
        }
        return { success: true };
      }
    }

    if (sql.startsWith("INSERT INTO daily_stats")) {
      const [orgId, fundId, date, grossRevenueCents, platformFeeCents, netRevenueCents] = args;
      const existing = this.dailyStats.find((item) => item.org_id === orgId && item.fund_id === fundId && item.date === date);
      if (existing) {
        existing.gross_revenue_cents += grossRevenueCents;
        existing.platform_fee_cents += platformFeeCents;
        existing.net_revenue_cents += netRevenueCents;
      } else {
        this.dailyStats.push({
          org_id: orgId,
          fund_id: fundId,
          date,
          gross_revenue_cents: grossRevenueCents,
          platform_fee_cents: platformFeeCents,
          net_revenue_cents: netRevenueCents,
        });
      }
      return { success: true };
    }

    throw new Error(`Unhandled run query: ${sql}`);
  }
}

function createEnv({ failEntitlement = false } = {}) {
  const DB = new FakeD1();
  const requests = [];

  const stub = {
    async fetch(request) {
      const path = new URL(request.url).pathname;
      const bodyText = request.method === "GET" ? "" : await request.text();
      const body = bodyText ? JSON.parse(bodyText) : null;
      requests.push({ path, body });

      if (path === "/credits/add") {
        return new Response(
          JSON.stringify(failEntitlement ? { error: "boom" } : { ok: true }),
          {
            status: failEntitlement ? 500 : 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      if (path === "/broadcast-raised") {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: `Unhandled path ${path}` }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    },
  };

  return {
    DB,
    JWT_SECRET: "test-secret",
    ORG_GAME: {
      idFromName(name) {
        return name;
      },
      get() {
        return stub;
      },
    },
    requests,
  };
}

function createIntent(overrides = {}) {
  return {
    id: "pi_test_1",
    status: "succeeded",
    amount_received: 99,
    application_fee_amount: 3,
    created: 1_710_000_000,
    latest_charge: {
      balance_transaction: {
        fee: 30,
      },
    },
    transfer_data: {
      destination: "acct_test_1",
    },
    metadata: {
      type: "sabotage_credits",
      credits: "1",
      playerName: "Alice",
      orgId: "org_1",
      orgSlug: "demo",
    },
    ...overrides,
  };
}

const org = { id: "org_1", slug: "demo" };
const stripeAccount = { stripe_account_id: "acct_test_1" };

test("reconcileSuccessfulPayment fulfills once, records analytics, and stays idempotent", async () => {
  const env = createEnv();
  const intent = createIntent();

  const first = await reconcileSuccessfulPayment(env, org, intent, stripeAccount);
  assert.deepEqual(first, { ok: true, alreadyProcessed: false, paymentIntentId: "pi_test_1" });

  assert.equal(env.DB.transactions.length, 1);
  assert.equal(env.DB.transactions[0].status, "succeeded");
  assert.equal(env.DB.transactions[0].player_name, "Alice");
  assert.equal(env.DB.dailyStats.length, 1);
  assert.deepEqual(env.DB.dailyStats[0], {
    org_id: "org_1",
    fund_id: "",
    date: "2024-03-09",
    gross_revenue_cents: 99,
    platform_fee_cents: 3,
    net_revenue_cents: 66,
  });
  assert.deepEqual(env.requests.map((request) => request.path), ["/credits/add", "/broadcast-raised"]);
  assert.deepEqual(env.requests[0].body, {
    paymentIntentId: "pi_test_1",
    playerName: "Alice",
    count: 1,
  });
  assert.deepEqual(env.requests[1].body, {
    transactionCount: 1,
    totalRaisedCents: 99,
  });

  const second = await reconcileSuccessfulPayment(env, org, intent, stripeAccount);
  assert.deepEqual(second, { ok: true, alreadyProcessed: true, paymentIntentId: "pi_test_1" });
  assert.equal(env.DB.dailyStats.length, 1);
  assert.deepEqual(env.requests.map((request) => request.path), ["/credits/add", "/broadcast-raised"]);
});

test("reconcileSuccessfulPayment marks the ledger row failed when entitlement execution fails", async () => {
  const env = createEnv({ failEntitlement: true });
  const intent = createIntent({ id: "pi_test_fail" });

  await assert.rejects(
    reconcileSuccessfulPayment(env, org, intent, stripeAccount),
    /boom/
  );

  assert.equal(env.DB.transactions.length, 1);
  assert.equal(env.DB.transactions[0].status, "failed");
  assert.equal(env.DB.dailyStats.length, 0);
  assert.deepEqual(env.requests.map((request) => request.path), ["/credits/add"]);
});
