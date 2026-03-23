// Fund Clicker API client
// Communicates with the Cloudflare Worker backend

const API_BASE = "https://api.fundclicker.com/api/v1";

const WS_BASE = "wss://api.fundclicker.com/api/v1";

class FundClickerAPI {
  constructor() {
    this.token = null; // Admin JWT (for admin portal)
  }

  setToken(token) {
    this.token = token;
  }

  async request(path, options = {}) {
    const headers = { "Content-Type": "application/json", ...options.headers };
    const authToken = options.authToken || this.token;
    if (authToken) headers.Authorization = `Bearer ${authToken}`;

    let res;
    const maxRetries = options.retries || 0;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        res = await fetch(`${API_BASE}${path}`, {
          ...options,
          headers,
          body: options.body ? JSON.stringify(options.body) : undefined,
        });
        break; // Success — exit retry loop
      } catch (networkError) {
        if (attempt === maxRetries) {
          throw new Error("Network error — check your connection and try again");
        }
        // Wait before retry: 1s, 2s, 4s
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
      }
    }

    let data;
    try {
      data = await res.json();
    } catch {
      throw new Error(`Server returned invalid response (HTTP ${res.status})`);
    }

    if (!res.ok) {
      const message = data.error || `Request failed (HTTP ${res.status})`;
      const error = new Error(message);
      error.status = res.status;
      error.serverError = data.error;
      throw error;
    }
    return data;
  }

  // ── Org discovery
  async joinByCode(code) {
    return this.request("/join", { method: "POST", body: { code } });
  }

  async searchOrgs(query) {
    return this.request(`/search?q=${encodeURIComponent(query)}`);
  }

  async getOrgInfo(slug) {
    return this.request(`/orgs/${slug}/`);
  }

  // ── Player accounts (per-org, via DO)
  async register(slug, name, pin) {
    return this.request(`/orgs/${slug}/account/register`, {
      method: "POST",
      body: { name, pin },
    });
  }

  async login(slug, name, pin) {
    return this.request(`/orgs/${slug}/account/login`, {
      method: "POST",
      body: { name, pin },
    });
  }

  async logout(slug, token) {
    return this.request(`/orgs/${slug}/account/logout`, {
      method: "POST",
      body: { token },
    });
  }

  // ── Payments (Stripe Connect)
  async createPaymentIntent(slug, { amount, type, description, metadata, authToken = null }) {
    return this.request(`/orgs/${slug}/payment-intent`, {
      method: "POST",
      body: { amount, type, description, metadata },
      authToken,
    });
  }

  async confirmPayment(slug, paymentIntentId, authToken = null) {
    return this.request(`/orgs/${slug}/payment-confirmation`, {
      method: "POST",
      body: { paymentIntentId },
      authToken,
    });
  }

  // ── Push notifications
  async subscribePush(slug, playerName, expoPushToken, authToken = null) {
    return this.request(`/orgs/${slug}/push/subscribe`, {
      method: "POST",
      body: { playerName, expoPushToken },
      authToken,
    });
  }

  // ── Credits
  async getCredits(slug, playerName, authToken = null) {
    return this.request(`/orgs/${slug}/credits/get`, {
      method: "POST",
      body: { playerName },
      authToken,
    });
  }

  // ── WebSocket URL for an org
  getWebSocketURL(slug) {
    return `${WS_BASE}/orgs/${slug}/ws`;
  }

  // ── Platform admin endpoints
  async registerOrg(name, email, password, slug) {
    return this.request("/platform/register", {
      method: "POST",
      body: { name, email, password, slug },
    });
  }

  async adminLogin(email, password) {
    return this.request("/platform/login", {
      method: "POST",
      body: { email, password },
    });
  }

  async getMe() {
    return this.request("/platform/me");
  }

  async updateOrgConfig(config) {
    return this.request("/platform/config", {
      method: "PUT",
      body: config,
    });
  }

  async connectStripe() {
    return this.request("/stripe/connect", { method: "POST" });
  }
}

export const api = new FundClickerAPI();
export { API_BASE, WS_BASE };
