import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import type { TokenManager } from '../../auth/tokenManager.js';
import { shapeAccountInfo } from './accountInfoShaping.js';

export function register(server: McpServer, client: ProxyClient, tokenManager: TokenManager): void {
  server.tool(
    'get_account_info',
    'Get the current user\'s account information as structured data, including authentication state, subscription tier/status, and MCP capabilities such as web search.',
    {},
    async () => {
      const profile = tokenManager.getProfileCached();
      return shapeAccountInfo(profile, client.hasSearchKey);
    },
  );
}
