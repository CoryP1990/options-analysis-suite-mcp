import { describe, expect, test, mock, beforeEach } from 'bun:test';
import { AuthError, SubscriptionError } from '../types.js';

// We mock the entire authClient module so TokenManager exercises its real
// orchestration logic against deterministic auth/profile responses.
const fakes = {
  login: mock(async () => ({ accessToken: 'tok', refreshToken: 'r', expiresAt: Date.now() + 3_600_000 })),
  refreshAccessToken: mock(async () => ({ accessToken: 'tok2', refreshToken: 'r2', expiresAt: Date.now() + 3_600_000 })),
  getProfile: mock(async () => ({
    user: { isDeveloper: false, bypassSubscription: false } as any,
    subscription: { status: 'active' } as any,
  })),
};

mock.module('./authClient.js', () => fakes);

// Import AFTER mocking the dependency so TokenManager binds to the mock.
const { TokenManager } = await import('./tokenManager.js');

function activeProfile() {
  return {
    user: { isDeveloper: false, bypassSubscription: false } as any,
    subscription: { status: 'active' } as any,
  };
}
function inactiveProfile() {
  return {
    user: { isDeveloper: false, bypassSubscription: false } as any,
    subscription: { status: 'canceled' } as any,
  };
}
function expiredTokens() {
  // expiresAt in the past forces getAccessToken() into the refresh path.
  return { accessToken: 'old', refreshToken: 'old-r', expiresAt: Date.now() - 1_000 };
}
function freshTokens() {
  return { accessToken: 'new', refreshToken: 'new-r', expiresAt: Date.now() + 3_600_000 };
}

beforeEach(() => {
  fakes.login.mockReset();
  fakes.refreshAccessToken.mockReset();
  fakes.getProfile.mockReset();
});

describe('TokenManager — initialize() subscription enforcement', () => {
  test('throws SubscriptionError when subscription is inactive at startup', async () => {
    fakes.login.mockImplementation(async () => freshTokens());
    fakes.getProfile.mockImplementation(async () => inactiveProfile());

    const tm = new TokenManager('https://auth', 'a@b.c', 'pw');
    await expect(tm.initialize()).rejects.toBeInstanceOf(SubscriptionError);
  });
});

describe('TokenManager — doRefresh() preserves SubscriptionError (PR #5 P1)', () => {
  test('inactive subscription on refresh path surfaces SubscriptionError, not AuthError', async () => {
    // Initialize with an active subscription so we can reach getAccessToken.
    fakes.login.mockImplementation(async () => freshTokens());
    fakes.getProfile.mockImplementation(async () => activeProfile());
    const tm = new TokenManager('https://auth', 'a@b.c', 'pw');
    await tm.initialize();
    tm.destroy(); // cancel the proactive timer

    // Force an expired-token state so getAccessToken triggers doRefresh.
    (tm as any).tokens = expiredTokens();

    // Refresh succeeds, but the refreshed profile is inactive.
    fakes.refreshAccessToken.mockImplementation(async () => freshTokens());
    fakes.getProfile.mockImplementation(async () => inactiveProfile());

    await expect(tm.getAccessToken()).rejects.toBeInstanceOf(SubscriptionError);
  });

  test('refresh fails + re-login succeeds + subscription inactive surfaces SubscriptionError', async () => {
    fakes.login.mockImplementation(async () => freshTokens());
    fakes.getProfile.mockImplementation(async () => activeProfile());
    const tm = new TokenManager('https://auth', 'a@b.c', 'pw');
    await tm.initialize();
    tm.destroy();
    (tm as any).tokens = expiredTokens();

    // Refresh throws → fallback re-login → re-login succeeds → subscription inactive.
    fakes.refreshAccessToken.mockImplementation(async () => { throw new Error('refresh 401'); });
    fakes.login.mockImplementation(async () => freshTokens());
    fakes.getProfile.mockImplementation(async () => inactiveProfile());

    await expect(tm.getAccessToken()).rejects.toBeInstanceOf(SubscriptionError);
  });

  test('refresh fails + re-login fails surfaces AuthError', async () => {
    fakes.login.mockImplementation(async () => freshTokens());
    fakes.getProfile.mockImplementation(async () => activeProfile());
    const tm = new TokenManager('https://auth', 'a@b.c', 'pw');
    await tm.initialize();
    tm.destroy();
    (tm as any).tokens = expiredTokens();

    fakes.refreshAccessToken.mockImplementation(async () => { throw new Error('refresh 401'); });
    fakes.login.mockImplementation(async () => { throw new Error('login 401'); });

    await expect(tm.getAccessToken()).rejects.toBeInstanceOf(AuthError);
  });
});
