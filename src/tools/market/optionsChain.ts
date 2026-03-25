import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'get_options_chain',
    'Get the options chain snapshot from the previous trading session close. Shows strikes, expirations, open interest, volume, IV, and Greeks. Returns the 100 most liquid contracts by default — use full=true for up to 2000. Useful for identifying liquid strikes, institutional positioning, and building multi-leg strategies. Note: prices are end-of-day, not real-time.',
    {
      symbol: z.string().describe('Ticker symbol (e.g., AAPL, SPY)'),
      full: z.boolean().optional().describe('Return all contracts (can be 2000+ for broad ETFs). Default false — returns top 100 by open interest.'),
    },
    toolHandler(async ({ symbol, full }) => {
      // Backend requires ticker and date params, does exact market_date lookup.
      // Compute previous trading day: skip weekends.
      const now = new Date();
      const day = now.getUTCDay();
      let daysBack = 1;
      if (day === 0) daysBack = 2;      // Sunday → Friday
      else if (day === 1) daysBack = 3; // Monday → Friday
      else if (day === 6) daysBack = 1; // Saturday → Friday
      const prev = new Date(now);
      prev.setDate(prev.getDate() - daysBack);
      const date = prev.toISOString().split('T')[0];
      const res = await client.get('/scanner/options-chain', {
        ticker: symbol.toUpperCase(),
        date,
      }) as any;

      if (full) return { _skipSizeGuard: true, data: res };

      if (res && Array.isArray(res.contracts) && res.contracts.length > 100) {
        res.contracts.sort((a: any, b: any) => (b.openInterest || 0) - (a.openInterest || 0));
        res._contracts_note = `Showing top 100 of ${res.contracts.length} contracts by open interest. Use full=true for all.`;
        res.contracts = res.contracts.slice(0, 100);
      }

      return res;
    }),
  );
}
