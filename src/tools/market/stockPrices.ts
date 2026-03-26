import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'get_stock_prices',
    'Get historical OHLCV price data for a stock or ETF. Returns daily open, high, low, close, and volume. Useful for charting, technical analysis, and correlating price action with options flow. Capped at 60 entries.',
    {
      symbol: z.string().describe('Ticker symbol (e.g., AAPL, SPY)'),
      days: z.number().int().min(1).max(60).default(30).describe('Number of trading days (default 30, max 60)'),
    },
    toolHandler(async ({ symbol, days }) => {
      // Backend route: /stock-prices/:symbol with optional start/end/limit params
      const res = await client.get(`/stock-prices/${encodeURIComponent(symbol.toUpperCase())}`, {
        limit: String(days),
      }) as any;

      const cap = 60;
      if (Array.isArray(res)) {
        if (res.length > cap) {
          return {
            _note: `Trimmed from ${res.length} to last ${cap} entries (tool cap).`,
            data: res.slice(-cap),
          };
        }
        return res;
      }
      for (const key of Object.keys(res ?? {})) {
        if (Array.isArray(res[key]) && res[key].length > cap) {
          res[`_${key}_note`] = `Trimmed from ${res[key].length} to last ${cap} entries (tool cap).`;
          res[key] = res[key].slice(-cap);
        }
      }
      return res;
    }),
  );
}
