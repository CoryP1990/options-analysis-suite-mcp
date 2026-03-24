import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'get_options_analytics_history',
    'Get daily end-of-day options analytics snapshots for a symbol. Covers ATM IV, HV, IV rank/percentile, VWIV, skew, GEX/DEX/VEX, put/call ratio, max pain, support/resistance walls, expected move, and term structure. Up to 5000 days of history.',
    {
      symbol: z.string().describe('Ticker symbol (e.g., AAPL, SPY)'),
      days: z.number().int().min(1).max(5000).default(30).describe('Days of history (default 30). Up to 5000.'),
      interval: z.enum(['daily', 'weekly', 'biweekly', 'monthly']).default('daily').describe('Sampling interval (default daily)'),
    },
    toolHandler(async ({ symbol, days, interval }) => {
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - days);
      const fmt = (d: Date) => d.toISOString().split('T')[0];

      const res = await client.get('/history', {
        symbol: symbol.toUpperCase(),
        from: fmt(from),
        to: fmt(to),
        limit: String(days),
        interval,
      }) as any;

      // Only trim when using the default — if user explicitly requested a value, return full data
      if (days === 30) {
        const cap = 30;
        for (const key of Object.keys(res ?? {})) {
          if (Array.isArray(res[key]) && res[key].length > cap) {
            res[`_${key}_note`] = `Trimmed from ${res[key].length} to last ${cap} entries. Set days explicitly for full data.`;
            res[key] = res[key].slice(-cap);
          }
        }
      }

      return res;
    }),
  );
}
