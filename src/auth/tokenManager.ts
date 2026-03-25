/**
 * Token Manager
 *
 * Manages JWT lifecycle for the MCP server process:
 * - Initial login on startup
 * - Proactive refresh 2 minutes before expiry
 * - Subscription verification
 * - Graceful error handling for long-running stdio process
 */
import { login, refreshAccessToken, getProfile } from './authClient.js';
import type { AuthTokens, UserProfile } from '../types.js';
import { AuthError, SubscriptionError } from '../types.js';

const REFRESH_BUFFER_MS = 2 * 60 * 1000; // Refresh 2 min before expiry

export class TokenManager {
  private tokens: AuthTokens | null = null;
  private profile: UserProfile | null = null;
  private refreshTimerId: ReturnType<typeof setTimeout> | null = null;
  private refreshPromise: Promise<void> | null = null;

  constructor(
    private authServerUrl: string,
    private email: string,
    private password: string,
  ) {}

  /**
   * Login, fetch profile, verify subscription, schedule refresh.
   * Throws AuthError or SubscriptionError on failure.
   */
  async initialize(): Promise<void> {
    // Login
    this.tokens = await login(this.authServerUrl, this.email, this.password);

    // Fetch profile and verify subscription
    this.profile = await getProfile(this.authServerUrl, this.tokens.accessToken);

    if (!this.isSubscriptionActive()) {
      throw new SubscriptionError(
        'Your Options Analysis Suite subscription is not active. ' +
        'Please visit optionsanalysissuite.com/pricing to subscribe or renew.',
      );
    }

    // Schedule proactive refresh
    this.scheduleRefresh();
  }

  /**
   * Get a valid access token, refreshing if needed.
   */
  async getAccessToken(): Promise<string> {
    if (!this.tokens) {
      throw new AuthError('Not authenticated. Please restart the MCP extension.');
    }

    // If within buffer of expiry, refresh now (deduplicate concurrent callers)
    const now = Date.now();
    if (now >= this.tokens.expiresAt - REFRESH_BUFFER_MS) {
      if (!this.refreshPromise) {
        this.refreshPromise = this.doRefresh()
          .then(() => this.scheduleRefresh())
          .finally(() => { this.refreshPromise = null; });
      }
      await this.refreshPromise;
    }

    return this.tokens.accessToken;
  }

  /**
   * Get cached user profile.
   */
  getProfileCached(): UserProfile | null {
    return this.profile;
  }

  /**
   * Check if user has active subscription.
   */
  isSubscriptionActive(): boolean {
    if (!this.profile) return false;
    if (this.profile.user.isDeveloper) return true;
    if (this.profile.user.bypassSubscription) return true;
    if (!this.profile.subscription) return false;
    const status = this.profile.subscription.status;
    return status === 'active' || status === 'trialing';
  }

  /**
   * Clean up timers.
   */
  destroy(): void {
    if (this.refreshTimerId) {
      clearTimeout(this.refreshTimerId);
      this.refreshTimerId = null;
    }
  }

  private scheduleRefresh(): void {
    if (!this.tokens) return;

    // Clear any existing timer to prevent double-scheduling
    if (this.refreshTimerId) {
      clearTimeout(this.refreshTimerId);
      this.refreshTimerId = null;
    }

    const now = Date.now();
    const delay = Math.max(
      this.tokens.expiresAt - now - REFRESH_BUFFER_MS,
      30_000, // minimum 30s to prevent tight loops
    );

    this.refreshTimerId = setTimeout(async () => {
      // Use the same refreshPromise dedup as the inline path
      if (!this.refreshPromise) {
        this.refreshPromise = this.doRefresh()
          .then(() => this.scheduleRefresh())
          .finally(() => { this.refreshPromise = null; });
      }
      try { await this.refreshPromise; } catch {
        // Refresh failed — will retry on next getAccessToken() call
      }
    }, delay);
  }

  private async doRefresh(): Promise<void> {
    if (!this.tokens?.refreshToken) {
      throw new AuthError('No refresh token available. Please restart the MCP extension.');
    }

    try {
      this.tokens = await refreshAccessToken(this.authServerUrl, this.tokens.refreshToken);
      // Re-check profile/subscription on refresh
      this.profile = await getProfile(this.authServerUrl, this.tokens.accessToken);
    } catch (err) {
      // If refresh fails, try full re-login
      try {
        this.tokens = await login(this.authServerUrl, this.email, this.password);
        this.profile = await getProfile(this.authServerUrl, this.tokens.accessToken);
      } catch {
        throw new AuthError('Session expired and re-login failed. Please restart the MCP extension.');
      }
    }
  }
}
