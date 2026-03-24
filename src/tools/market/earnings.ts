import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'get_earnings',
    'Get earnings history and estimates for a company. Returns actual EPS, estimates, revenue, and surprise percentages. Earnings events are the largest source of overnight gap risk for options — check if an upcoming earnings date falls within an option\'s expiration window. Shows last 8 quarters by default.',
    {
      symbol: z.string().describe('Ticker symbol'),
    },
    toolHandler(async ({ symbol }) => {
      const res = await client.get(`/earnings/${encodeURIComponent(symbol.toUpperCase())}`) as any;
      // Backend returns earnings_history array — cap to last 8 quarters
      if (res && Array.isArray(res.earnings_history) && res.earnings_history.length > 8) {
        res._earnings_history_note = `Showing last 8 of ${res.earnings_history.length} quarters.`;
        res.earnings_history = res.earnings_history.slice(0, 8);
      }
      return res;
    }),
  );
}
