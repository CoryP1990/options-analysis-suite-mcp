import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';
import { summarizeShortInterest } from './marketFlowShaping.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'get_short_interest',
    'Get FINRA biweekly short interest data for a symbol with a compact summary-first default view. Use full=true for the full settlement history.',
    {
      symbol: z.string().describe('Ticker symbol (e.g., AAPL, GME)'),
      full: z.boolean().optional().describe('Return the raw FINRA short-interest payload instead of the compact summary.'),
    },
    toolHandler(async ({ symbol, full }) => {
      const upperSymbol = encodeURIComponent(symbol.toUpperCase());
      const [res, companyProfile] = await Promise.all([
        client.get(`/finra/short-interest/${upperSymbol}`),
        client.get(`/company-profile/${upperSymbol}`).catch(() => null),
      ]);
      if (full) {
        return { _skipSizeGuard: true, data: res };
      }
      return summarizeShortInterest(res, 8, companyProfile);
    }),
  );
}
