import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import type { TokenManager } from '../../auth/tokenManager.js';
import { shapeAccountInfo } from './accountInfoShaping.js';

// `client` retained in signature so registry's uniform 3-arg call site stays
// working — get_account_info no longer needs proxy access after web-search
// removal.
export function register(server: McpServer, _client: ProxyClient, tokenManager: TokenManager): void {
  server.registerTool(
    'get_account_info',
    {
      title: 'Account Info',
      description: 'Get the current user\'s account information as structured data, including authentication state and subscription tier/status.',
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async () => {
      const profile = tokenManager.getProfileCached();
      const info = shapeAccountInfo(profile);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(info, null, 2) }],
      };
    },
  );
}
