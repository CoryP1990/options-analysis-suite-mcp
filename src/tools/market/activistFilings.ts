import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';
import { shapeActivistFilingsResponse } from './activistFilingsShaping.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'get_activist_filings',
    'Get Schedule 13D/13G beneficial-ownership filings for a symbol. Default response prioritizes the latest above-threshold holder snapshot per filer and summarizes below-threshold amendments separately so current holders stay visible. Use full=true for the raw filing list.',
    {
      symbol: z.string().describe('Ticker symbol'),
      full: z.boolean().optional().describe('Return the raw filing list instead of the compact current-holder summary.'),
    },
    toolHandler(async ({ symbol, full }) => {
      const response = await client.get(`/activist-filings/${encodeURIComponent(symbol.toUpperCase())}`) as any;
      if (full) return { _skipSizeGuard: true, data: response };
      return shapeActivistFilingsResponse(response);
    }),
  );
}
