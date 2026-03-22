// Stripe Connect helpers for Fund Clicker multi-tenant payments
// Standard Connect: orgs bring their own Stripe account, platform takes application_fee

const STRIPE_API = "https://api.stripe.com/v1";

// Platform fee: 3% of transaction amount
const PLATFORM_FEE_PERCENT = 3;

export function calculatePlatformFee(amount) {
  return Math.round(Number(amount || 0) * PLATFORM_FEE_PERCENT / 100);
}

function stripeHeaders(secretKey) {
  return {
    Authorization: "Basic " + btoa(secretKey + ":"),
    "Content-Type": "application/x-www-form-urlencoded",
  };
}

// Generate Stripe Connect OAuth URL for org onboarding
export function getConnectOAuthURL(env, orgId, orgSlug) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: env.STRIPE_CLIENT_ID,
    scope: "read_write",
    redirect_uri: `${env.ADMIN_URL}/stripe/callback`,
    state: orgId, // passed back after OAuth
    "stripe_user[business_type]": "non_profit",
    "stripe_user[url]": `${env.ADMIN_URL}/orgs/${orgSlug}`,
  });
  return `https://connect.stripe.com/oauth/authorize?${params}`;
}

// Exchange OAuth authorization code for a connected account ID
export async function exchangeOAuthCode(code, env) {
  const res = await fetch(STRIPE_API + "/oauth/token", {
    method: "POST",
    headers: stripeHeaders(env.STRIPE_SECRET_KEY),
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error_description || data.error);
  return {
    stripeAccountId: data.stripe_user_id,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
  };
}

// Create a PaymentIntent with application fee routed to the org's connected account
export async function createPaymentIntent(env, { amount, currency = "usd", description, metadata = {}, orgStripeAccountId }) {
  const feeAmount = calculatePlatformFee(amount);

  const params = new URLSearchParams({
    amount: String(amount),
    currency,
    description,
    application_fee_amount: String(feeAmount),
    "transfer_data[destination]": orgStripeAccountId,
  });

  // Add metadata
  for (const [key, value] of Object.entries(metadata)) {
    params.set(`metadata[${key}]`, String(value));
  }

  const res = await fetch(STRIPE_API + "/payment_intents", {
    method: "POST",
    headers: stripeHeaders(env.STRIPE_SECRET_KEY),
    body: params,
  });

  const intent = await res.json();
  if (intent.error) throw new Error(intent.error.message);
  return intent;
}

export async function getPaymentIntent(paymentIntentId, env) {
  const params = new URLSearchParams({
    "expand[]": "latest_charge.balance_transaction",
  });
  const res = await fetch(STRIPE_API + "/payment_intents/" + paymentIntentId + "?" + params.toString(), {
    headers: stripeHeaders(env.STRIPE_SECRET_KEY),
  });
  const intent = await res.json();
  if (intent.error) throw new Error(intent.error.message);
  return intent;
}

// Check if a connected account has charges enabled
export async function getAccountStatus(stripeAccountId, env) {
  const res = await fetch(STRIPE_API + "/accounts/" + stripeAccountId, {
    headers: stripeHeaders(env.STRIPE_SECRET_KEY),
  });
  const account = await res.json();
  if (account.error) throw new Error(account.error.message);
  return {
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    detailsSubmitted: account.details_submitted,
  };
}

// Create a Stripe Connect account link for onboarding (alternative to OAuth)
export async function createAccountLink(stripeAccountId, env, orgSlug) {
  const res = await fetch(STRIPE_API + "/account_links", {
    method: "POST",
    headers: stripeHeaders(env.STRIPE_SECRET_KEY),
    body: new URLSearchParams({
      account: stripeAccountId,
      refresh_url: `${env.ADMIN_URL}/orgs/${orgSlug}/stripe/refresh`,
      return_url: `${env.ADMIN_URL}/orgs/${orgSlug}/stripe/complete`,
      type: "account_onboarding",
    }),
  });
  const link = await res.json();
  if (link.error) throw new Error(link.error.message);
  return link.url;
}

// Verify a Stripe webhook signature
export async function verifyWebhookSignature(payload, sigHeader, webhookSecret) {
  const parts = sigHeader.split(",").reduce((acc, part) => {
    const [key, val] = part.split("=");
    acc[key] = val;
    return acc;
  }, {});

  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  // Reject timestamps older than 5 minutes
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

  const signedPayload = timestamp + "." + payload;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(webhookSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
  const expected = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");

  return expected === signature;
}
