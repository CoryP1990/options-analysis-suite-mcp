import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'get_dark_pool_data',
    'Get FINRA OTC (dark pool) trading data and ATS (Alternative Trading System) statistics for a symbol. Shows off-exchange volume, dark pool participation rates, and which ATSes are most active. High dark pool activity can signal institutional accumulation or distribution.',
    {
      symbol: z.string().describe('Ticker symbol'),
    },
    toolHandler(async ({ symbol }) => {
      const [otc, ats] = await Promise.all([
        client.get(`/finra/otc-trading/${encodeURIComponent(symbol.toUpperCase())}`),
        client.get(`/finra/ats-data/${encodeURIComponent(symbol.toUpperCase())}`),
      ]);
      return { otcTrading: otc, atsData: ats };
    }),
  );
}
