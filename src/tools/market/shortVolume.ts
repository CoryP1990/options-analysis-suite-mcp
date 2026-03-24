import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'get_short_volume',
    'Get FINRA daily short volume data for a stock. Shows the percentage of daily volume that is short selling, with trailing averages. Abnormally high short volume above the symbol\'s average can indicate bearish institutional sentiment or hedging that affects options pricing.',
    {
      symbol: z.string().describe('Ticker symbol'),
    },
    toolHandler(async ({ symbol }) => {
      const res = await client.get(`/finra/short-volume/${encodeURIComponent(symbol.toUpperCase())}`) as any;
      // Trim history array to last 30 entries; keep summary fields (latest, averages, yearStats) as-is
      if (res && Array.isArray(res.history) && res.history.length > 30) {
        res._history_note = `Trimmed from ${res.history.length} to last 30 entries.`;
        res.history = res.history.slice(-30);
      }
      return res;
    }),
  );
}
