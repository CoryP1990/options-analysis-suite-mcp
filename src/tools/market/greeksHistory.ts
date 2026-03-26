import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'get_greeks_history',
    'Get historical options Greeks (delta, gamma, theta, vega) for a symbol. Shows how sensitivity profiles and dealer hedging pressure have shifted over time. Response trimmed to last 14 days; narrow start/end for specific data.',
    {
      symbol: z.string().describe('Ticker symbol'),
      start: z.string().describe('Start date (YYYY-MM-DD)'),
      end: z.string().describe('End date (YYYY-MM-DD)'),
    },
    toolHandler(async ({ symbol, start, end }) => {
      const res = await client.get(`/scanner/greeks-history/${encodeURIComponent(symbol.toUpperCase())}`, { start, end }) as any;
      // Backend returns data as a flat array of daily records — cap to last 14 entries
      if (res && Array.isArray(res.data) && res.data.length > 14) {
        res._data_note = `Trimmed from ${res.data.length} to last 14 days. Narrow start/end dates for specific data.`;
        res.data = res.data.slice(-14);
      }
      return res;
    }),
  );
}
