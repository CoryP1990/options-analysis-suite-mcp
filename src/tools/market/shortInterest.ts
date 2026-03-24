import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'get_short_interest',
    'Get FINRA biweekly short interest data for a symbol. Different from daily short volume — this shows the total shares sold short, days to cover, and short interest as a percentage of float. Published twice monthly with a reporting lag.',
    {
      symbol: z.string().describe('Ticker symbol (e.g., AAPL, GME)'),
    },
    toolHandler(async ({ symbol }) => {
      return client.get(`/finra/short-interest/${encodeURIComponent(symbol.toUpperCase())}`);
    }),
  );
}
