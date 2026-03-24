import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'get_yield_curve',
    'Get the US Treasury yield curve from 1-month to 30-year maturities. The yield curve affects options pricing through the risk-free rate and signals macro regime shifts. An inverted curve historically precedes recessions where put protection becomes more valuable. Returns the latest curve snapshot.',
    {},
    toolHandler(async () => {
      const res = await client.get('/treasury/yield-curve') as any;
      // Backend returns { curve, currentDate, analysis, historical, yieldCurve, source }
      // Strip historical array (can be large) — keep current snapshot
      if (res && Array.isArray(res.historical) && res.historical.length > 1) {
        res._historical_note = `${res.historical.length} historical observations omitted. Current curve data retained.`;
        delete res.historical;
      }
      return res;
    }),
  );
}
