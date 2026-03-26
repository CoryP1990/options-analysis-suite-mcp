import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import type { TokenManager } from '../../auth/tokenManager.js';

export function register(server: McpServer, client: ProxyClient, tokenManager: TokenManager): void {
  server.tool(
    'get_account_info',
    'Get the current user\'s account information including email, subscription tier, and status. Useful for understanding what data access the user has and diagnosing permission errors.',
    {},
    async () => {
      const profile = tokenManager.getProfileCached();
      if (!profile) {
        return { content: [{ type: 'text' as const, text: 'Account information not available. The user may not be authenticated.' }] };
      }
      const sub = profile.subscription;
      const info = {
        email: profile.user.email,
        role: profile.user.role,
        tier: sub?.planType || 'none',
        status: sub?.status || 'none',
        daysRemaining: sub?.daysRemaining,
        hasWebSearch: client.hasSearchKey,
      };
      return { content: [{ type: 'text' as const, text: JSON.stringify(info) }] };
    },
  );
}
