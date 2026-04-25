import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import type { TokenManager } from '../../auth/tokenManager.js';
import { shapeAccountInfo } from './accountInfoShaping.js';

export function register(server: McpServer, client: ProxyClient, tokenManager: TokenManager): void {
  server.registerTool(
    'get_account_info',
    {
      title: 'Account Info',
      description: 'Get the current user\'s account information as structured data, including authentication state, subscription tier/status, and MCP capabilities such as web search.',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () => {
      const profile = tokenManager.getProfileCached();
      const info = shapeAccountInfo(profile, client.hasSearchKey);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(info, null, 2) }],
      };
    },
  );
}
