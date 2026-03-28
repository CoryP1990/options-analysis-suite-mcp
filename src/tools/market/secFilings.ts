import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';
import { shapeSecFilingsResponse } from './secFilingsShaping.js';

const FILING_TYPE = z.enum([
  'all',
  '10-K',
  '10-Q',
  '8-K',
  'S-1',
  'S-3',
  'DEF 14A',
  '4',
  '13D',
  '13G',
  '424B2',
  '424B3',
  '424B4',
  '424B5',
]);

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'get_sec_filings',
    'Get recent SEC EDGAR filings for a symbol. Useful for finding 10-K, 10-Q, 8-K, proxy, insider, offering, and activist filings with direct SEC URLs. Default response returns a compact filing list with dates, form types, descriptions, accession numbers, and filing links.',
    {
      symbol: z.string().describe('Ticker symbol (e.g., AAPL, TSLA)'),
      limit: z.number().int().min(1).max(50).default(10).describe('Maximum number of filings to return (default 10, max 50).'),
      type: FILING_TYPE.default('all').describe('Optional SEC form-type filter. Use 424B2/3/4/5 for prospectus supplements; default all returns the most recent mixed filing list.'),
      full: z.boolean().optional().describe('Return the raw SEC EDGAR filing payload instead of the compact summary.'),
    },
    toolHandler(async ({ symbol, limit, type, full }) => {
      const upperSymbol = encodeURIComponent(symbol.toUpperCase());
      const response = await client.get(`/sec-filings/${upperSymbol}`, {
        limit: String(limit),
        ...(type !== 'all' ? { type } : {}),
      }) as any;

      if (full) {
        return { _skipSizeGuard: true, data: response };
      }

      return shapeSecFilingsResponse(response, limit);
    }),
  );
}
