import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';
import { summarizeShortVolume } from './marketFlowShaping.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'get_short_volume',
    'Get FINRA daily short volume data for a stock with a summary-first default view. Use full=true for the raw daily history.',
    {
      symbol: z.string().describe('Ticker symbol'),
      full: z.boolean().optional().describe('Return the raw FINRA daily history instead of the compact summary.'),
    },
    toolHandler(async ({ symbol, full }) => {
      const res = await client.get(`/finra/short-volume/${encodeURIComponent(symbol.toUpperCase())}`) as any;

      if (full) {
        if (res && Array.isArray(res.history) && res.history.length > 30) {
          res._history_note = `Trimmed from ${res.history.length} to most recent 30 entries.`;
          res.history = res.history.slice(0, 30);
        }
        return { _skipSizeGuard: true, data: res };
      }

      return summarizeShortVolume(res);
    }),
  );
}
