import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'get_analyst_data',
    'Get Wall Street analyst ratings, price targets, and consensus estimates for a symbol. Includes buy/hold/sell distribution, mean/median price targets, recent rating changes, and earnings estimates. Use full=true to include the complete upgrades/downgrades history.',
    {
      symbol: z.string().describe('Ticker symbol (e.g., AAPL, TSLA)'),
      full: z.boolean().optional().describe('Include full upgrades/downgrades history (~400KB). Default false — returns summary, targets, estimates, and last 20 rating changes.'),
    },
    toolHandler(async ({ symbol, full }) => {
      const res = await client.get(`/analyst-data/${encodeURIComponent(symbol.toUpperCase())}`);
      if (full) return { _skipSizeGuard: true, data: res };
      if (res && typeof res === 'object') {
        const data = res as Record<string, unknown>;
        return {
          symbol: data.symbol,
          estimates: data.estimates,
          price_target_summary: data.price_target_summary,
          price_target_consensus: data.price_target_consensus,
          rating_snapshot: data.rating_snapshot,
          historical_rating: data.historical_rating,
          upgrades_downgrades: Array.isArray(data.upgrades_downgrades)
            ? data.upgrades_downgrades.slice(0, 20)
            : data.upgrades_downgrades,
          fetched_at: data.fetched_at,
        };
      }
      return res;
    }),
  );
}
