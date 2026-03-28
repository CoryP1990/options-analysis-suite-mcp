import type { UserProfile } from '../../types.js';

export function shapeAccountInfo(
  profile: UserProfile | null,
  hasWebSearch: boolean,
): Record<string, unknown> {
  if (!profile) {
    return {
      authenticated: false,
      subscriptionActive: false,
      hasWebSearch,
      _note: 'Account information is not available. The MCP session may not be authenticated.',
    };
  }

  const sub = profile.subscription;
  const isDeveloper = Boolean(profile.user.isDeveloper);
  const bypassSubscription = Boolean(profile.user.bypassSubscription);
  const subscriptionActive = isDeveloper
    || bypassSubscription
    || sub?.status === 'active'
    || sub?.status === 'trialing';

  return {
    authenticated: true,
    email: profile.user.email,
    role: profile.user.role,
    isDeveloper,
    bypassSubscription,
    subscriptionActive,
    subscription: {
      tier: sub?.planType ?? 'none',
      status: sub?.status ?? 'none',
      currentPeriodEnd: sub?.currentPeriodEnd ?? null,
      daysRemaining: sub?.daysRemaining ?? null,
    },
    hasWebSearch,
  };
}
