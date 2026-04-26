import { describe, expect, it } from 'bun:test';
import { shapeAccountInfo } from './accountInfoShaping.js';

describe('shapeAccountInfo', () => {
  it('returns a structured authenticated account view', () => {
    const shaped = shapeAccountInfo({
      user: {
        id: 1,
        email: 'user@example.com',
        role: 'user',
        isDeveloper: false,
        bypassSubscription: false,
      },
      subscription: {
        status: 'active',
        planType: 'annual',
        currentPeriodEnd: '2026-12-31T00:00:00.000Z',
        daysRemaining: 279,
      },
    }) as Record<string, any>;

    expect(shaped.authenticated).toBe(true);
    expect(shaped.subscriptionActive).toBe(true);
    expect(shaped.email).toBe('user@example.com');
    expect(shaped.subscription.tier).toBe('annual');
    expect(shaped.subscription.status).toBe('active');
  });

  it('treats developer or bypass users as subscription-active even without a normal subscription row', () => {
    const shaped = shapeAccountInfo({
      user: {
        id: 2,
        email: 'dev@example.com',
        role: 'admin',
        isDeveloper: true,
        bypassSubscription: false,
      },
      subscription: null,
    }) as Record<string, any>;

    expect(shaped.authenticated).toBe(true);
    expect(shaped.isDeveloper).toBe(true);
    expect(shaped.subscriptionActive).toBe(true);
    expect(shaped.subscription.tier).toBe('none');
  });

  it('returns a truthful unauthenticated state when no cached profile exists', () => {
    const shaped = shapeAccountInfo(null) as Record<string, any>;

    expect(shaped.authenticated).toBe(false);
    expect(shaped.subscriptionActive).toBe(false);
    expect(String(shaped._note)).toContain('not available');
  });
});
