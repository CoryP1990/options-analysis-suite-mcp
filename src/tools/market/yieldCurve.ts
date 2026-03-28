import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';
import { summarizeYieldCurve } from './yieldCurveShaping.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'get_yield_curve',
    'Get the US Treasury yield curve with a compact current-curve summary by default. Returns key maturities, inversion flags, spreads, and small trend samples. Use full=true for the raw curve payload with historical observations.',
    {
      weeks: z.number().int().min(1).max(52).default(12).describe('Historical weeks to sample for trend context (default 12, max 52).'),
      full: z.boolean().optional().describe('Return the raw yield-curve payload, including historical observations, instead of the compact summary.'),
    },
    toolHandler(async ({ weeks, full }) => {
      const res = await client.get('/treasury/yield-curve', { weeks: String(weeks) }) as any;
      if (full) return { _skipSizeGuard: true, data: res };
      return summarizeYieldCurve(res);
    }),
  );
}
