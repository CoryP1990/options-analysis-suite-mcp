import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'get_most_active_options',
    'Get the most actively traded options contracts across the market. Ranked by volume with open interest, IV, and underlying symbol. Useful for discovering institutional flow concentration and liquid underlyings for strategies.',
    {
      limit: z.number().int().min(1).max(50).default(15).describe('Number of results (default 15). Increase up to 50 for a broader scan.'),
    },
    toolHandler(async ({ limit }) => {
      return client.get('/scanner/most-active', { limit: String(limit) });
    }),
  );
}
