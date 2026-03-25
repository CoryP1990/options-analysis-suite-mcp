import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'get_options_chain',
    'Get the end-of-day options chain snapshot from the most recent completed trading session. Data is sourced from ORATS and available after 1 AM ET the following day, so on Tuesday evening the latest data is from Monday. Shows strikes, expirations, open interest, volume, IV, and Greeks. Returns the 100 most liquid contracts by default — use full=true for all.',
    {
      symbol: z.string().describe('Ticker symbol (e.g., AAPL, SPY)'),
      full: z.boolean().optional().describe('Return all contracts (can be 2000+ for broad ETFs). Default false — returns top 100 by open interest.'),
    },
    toolHandler(async ({ symbol, full }) => {
      // ORATS EOD data is pulled at 1 AM ET, so the latest available chain
      // is always the previous trading day (not today).
      const now = new Date();
      const day = now.getUTCDay();
      let daysBack = 1;
      if (day === 0) daysBack = 2;      // Sunday → Friday
      else if (day === 1) daysBack = 3;  // Monday → Friday
      else if (day === 6) daysBack = 1;  // Saturday → Friday
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
