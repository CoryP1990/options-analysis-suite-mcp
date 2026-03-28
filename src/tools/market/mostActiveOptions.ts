import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';
import { summarizeMostActiveOptions } from './marketFlowShaping.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'get_most_active_options',
    'Get the most actively traded options across the market. Default contract view returns representative liquid flow leaders rather than raw penny or far-dated outliers; use view=ticker for aggregated underlying-level activity.',
    {
      limit: z.number().int().min(1).max(50).default(15).describe('Number of results (default 15). Increase up to 50 for a broader scan.'),
      view: z.enum(['contract', 'ticker']).default('contract').describe('Return either contract-level leaders (default) or aggregated ticker-level activity.'),
      index: z.enum(['all', 'sp500', 'sp400', 'sp600', 'etf']).default('all').describe('Filter to a specific index bucket. Default is all supported buckets.'),
    },
    toolHandler(async ({ limit, view, index }) => {
      const fetchLimit = view === 'contract' ? Math.min(Math.max(limit * 4, 40), 200) : limit;
      const response = await client.get('/scanner/most-active', {
        limit: String(fetchLimit),
        type: view,
        index,
      });
      return summarizeMostActiveOptions(response, limit);
    }),
  );
}
