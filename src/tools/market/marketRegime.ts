import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'get_market_regime',
    'Get the current market stress regime. Returns a composite stress score (0-100), confidence, and key drivers (VIX, credit spreads, yield curve, correlation, breadth). Above 60 = elevated stress with inflated option premiums. Below 30 = calm regime where selling premium tends to outperform. Use include_symbols=true to also get per-symbol regime breakdowns by sector.',
    {
      date: z.string().optional().describe('Specific date (YYYY-MM-DD), defaults to latest'),
      include_symbols: z.boolean().optional().describe('Include per-symbol regime breakdowns (~180KB). Default false — returns market summary only.'),
    },
    toolHandler(async ({ date, include_symbols }) => {
      const res = await client.get('/regime/current', date ? { date } : {});
      if (include_symbols) return { _skipSizeGuard: true, data: res };
      if (res && typeof res === 'object' && 'market' in res) {
        return { market: (res as any).market };
      }
      return res;
    }),
  );
}
