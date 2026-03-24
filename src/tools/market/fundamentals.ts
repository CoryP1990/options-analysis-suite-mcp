import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'get_fundamentals',
    'Get company fundamentals: market cap, P/E ratio, EPS, revenue, profit margins, dividend yield, beta, sector, and industry. Useful for assessing whether an options strategy aligns with the fundamental picture.',
    {
      symbol: z.string().describe('Ticker symbol'),
    },
    toolHandler(async ({ symbol }) => {
      return client.get(`/fundamentals/${encodeURIComponent(symbol.toUpperCase())}`);
    }),
  );
}
