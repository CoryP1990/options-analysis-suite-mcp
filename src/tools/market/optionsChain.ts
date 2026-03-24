import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'get_options_chain',
    'Get the full options chain snapshot from the previous trading session close. Shows all strikes, expirations, open interest, volume, IV, and Greeks. Useful for identifying liquid strikes, institutional positioning, and building multi-leg strategies. Note: prices are end-of-day, not real-time.',
    {
      symbol: z.string().describe('Ticker symbol (e.g., AAPL, SPY)'),
    },
    toolHandler(async ({ symbol }) => {
      // Backend requires ticker and date params, does exact market_date lookup.
      // Compute previous trading day: skip weekends (Sat→Fri, Sun→Fri, Mon→Fri if before market close).
      const now = new Date();
      const day = now.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
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

      // Cap contracts array to reduce token usage
      if (res && Array.isArray(res.contracts) && res.contracts.length > 200) {
        res._contracts_note = `Trimmed from ${res.contracts.length} to 200 contracts. Use a specific expiration filter for full chain.`;
        res.contracts = res.contracts.slice(0, 200);
      }

      return res;
    }),
  );
}
