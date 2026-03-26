import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'get_unusual_options',
    'Get unusual options activity — tickers with abnormally high volume relative to open interest across the market. Signals institutional positioning, pre-earnings bets, or speculative flows. Returns from the top ~100 most unusual tickers; use symbol to filter for a specific ticker (only matches if that ticker is currently in the top unusual list).',
    {
      symbol: z.string().optional().describe('Filter results to a specific ticker (client-side filter on market-wide scan)'),
      limit: z.number().int().min(1).max(50).default(20).describe('Max results (default 20)'),
    },
    toolHandler(async ({ symbol, limit }) => {
      // Backend returns market-wide scan; fetch enough to filter if symbol specified
      const fetchLimit = symbol ? 200 : limit;
      const res = await client.get('/scanner/unusual', { limit: String(fetchLimit) }) as any;
      if (symbol && res?.data) {
        const upper = symbol.toUpperCase();
        res.data = res.data.filter((item: any) => item.symbol === upper || item.ticker === upper);
        if (res.data.length === 0) return null;
      }
      if (res?.data && res.data.length > limit) {
        res.data = res.data.slice(0, limit);
      }
      return res;
    }),
  );
}
