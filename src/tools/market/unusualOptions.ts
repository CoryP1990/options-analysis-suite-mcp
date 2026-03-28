import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';
import { summarizeMostActiveOptions } from './marketFlowShaping.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'get_unusual_options',
    'Get unusual options flow ranked by volume-to-open-interest ratio. Default contract view returns representative unusual flow rather than raw penny or far-dated outliers; use view=ticker for aggregated underlying-level activity.',
    {
      symbol: z.string().optional().describe('Filter results to a specific underlying ticker, or to an exact option symbol in contract view.'),
      limit: z.number().int().min(1).max(50).default(20).describe('Max results (default 20)'),
      view: z.enum(['contract', 'ticker']).default('contract').describe('Return either contract-level unusual flow (default) or aggregated ticker-level activity.'),
      index: z.enum(['all', 'sp500', 'sp400', 'sp600', 'etf']).default('all').describe('Filter to a specific index bucket. Default is all supported buckets.'),
      threshold: z.number().min(0).default(1).describe('Minimum volume-to-open-interest ratio. Default is 1.0.'),
    },
    toolHandler(async ({ symbol, limit, view, index, threshold }) => {
      const fetchLimit = symbol ? 300 : limit;
      const res = await client.get('/scanner/unusual', {
        limit: String(fetchLimit),
        type: view,
        index,
        threshold: String(threshold),
      }) as any;

      if (symbol && res?.data) {
        const upper = symbol.toUpperCase();
        res.data = res.data.filter((item: any) => {
          if (view === 'contract') {
            return item.underlying === upper || item.symbol === upper;
          }
          return item.symbol === upper || item.ticker === upper;
        });
        if (res.data.length === 0) return null;
      }

      if (view === 'ticker' && res?.data && res.data.length > limit) {
        res.data = res.data.slice(0, limit);
      }

      return summarizeMostActiveOptions(res, limit);
    }),
  );
}
