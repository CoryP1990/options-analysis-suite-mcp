import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'get_market_regime',
    'Get the current market stress regime. Returns a composite stress score (0-100), confidence, and key drivers (VIX, credit spreads, yield curve, correlation, breadth). Above 60 = elevated stress with inflated option premiums. Below 30 = calm regime where selling premium tends to outperform.',
    {
      date: z.string().optional().describe('Specific date (YYYY-MM-DD), defaults to latest'),
    },
    toolHandler(async ({ date }) => {
      return client.get('/regime/current', date ? { date } : {});
    }),
  );
}
