import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'get_fail_to_deliver',
    'Get SEC Failure-to-Deliver (FTD) data for a symbol. High FTD counts can indicate naked short selling, settlement issues, or hard-to-borrow conditions that affect options pricing and short squeeze potential.',
    {
      symbol: z.string().describe('Ticker symbol'),
    },
    toolHandler(async ({ symbol }) => {
      return client.get(`/sec/fail-to-deliver/${encodeURIComponent(symbol.toUpperCase())}`);
    }),
  );
}
