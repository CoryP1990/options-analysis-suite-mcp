import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'get_analyst_data',
    'Get Wall Street analyst ratings, price targets, and consensus estimates for a symbol. Includes buy/hold/sell distribution, mean/median price targets, and recent rating changes.',
    {
      symbol: z.string().describe('Ticker symbol (e.g., AAPL, TSLA)'),
    },
    toolHandler(async ({ symbol }) => {
      return client.get(`/analyst-data/${encodeURIComponent(symbol.toUpperCase())}`);
    }),
  );
}
