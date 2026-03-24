import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'get_iv_history',
    'Get historical implied volatility (IV) and historical volatility (HV) for a stock or ETF. Shows how option-implied expected moves and realized moves have evolved. High IV relative to HV suggests options are expensive; low IV relative to HV suggests options are cheap.',
    {
      symbol: z.string().describe('Ticker symbol (e.g., AAPL, SPY)'),
      days: z.number().int().min(1).max(1095).default(90).describe('Days of history (default 90). Response trimmed to last 30 entries; increase days and request full data if needed.'),
    },
    toolHandler(async ({ symbol, days }) => {
      const res = await client.get('/scanner/history', { symbol: symbol.toUpperCase(), days: String(days) }) as any;
      // Only trim when using the default 90 — if user explicitly requested a value, return it all
      if (days === 90) {
        const cap = 30;
        if (res && Array.isArray(res.data) && res.data.length > cap) {
          res._data_note = `Trimmed from ${res.data.length} to last ${cap} entries. Set days explicitly for full data.`;
          res.data = res.data.slice(-cap);
        }
        if (res && Array.isArray(res.history) && res.history.length > cap) {
          res._history_note = `Trimmed from ${res.history.length} to last ${cap} entries. Set days explicitly for full data.`;
          res.history = res.history.slice(-cap);
        }
      }
      return res;
    }),
  );
}
