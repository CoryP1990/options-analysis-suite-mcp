import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'get_threshold_history',
    'Get SEC Regulation SHO threshold list history for a symbol. Stocks appear on the threshold list when they have persistent delivery failures — a signal of extreme short selling pressure and potential forced buy-ins. Checks the last 30 trading days by default.',
    {
      symbol: z.string().describe('Ticker symbol'),
      days: z.number().int().min(1).max(90).default(30).describe('Number of days to check (default 30, max 90)'),
    },
    toolHandler(async ({ symbol, days }) => {
      // Backend requires comma-separated dates. Generate last N trading days (skip weekends).
      const dates: string[] = [];
      const d = new Date();
      while (dates.length < days) {
        d.setDate(d.getDate() - 1);
        const dow = d.getUTCDay();
        if (dow !== 0 && dow !== 6) {
          dates.push(d.toISOString().split('T')[0]);
        }
      }
      return client.get(`/sec/threshold-history/${encodeURIComponent(symbol.toUpperCase())}`, {
        dates: dates.join(','),
      });
    }),
  );
}
