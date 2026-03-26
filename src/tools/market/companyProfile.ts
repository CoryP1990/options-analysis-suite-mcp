import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'get_company_profile',
    'Get company profile data for a symbol — sector, industry, market cap, description, CEO, employee count, and key identifiers. Useful for understanding what a company does before analyzing its options.',
    {
      symbol: z.string().describe('Ticker symbol (e.g., AAPL, TSLA)'),
    },
    toolHandler(async ({ symbol }) => {
      const res = await client.get(`/company-profile/${encodeURIComponent(symbol.toUpperCase())}`) as any;
      // Trim long descriptions to save tokens
      if (res?.description && res.description.length > 500) {
        res.description = res.description.slice(0, 500) + '...';
      }
      return res;
    }),
  );
}
