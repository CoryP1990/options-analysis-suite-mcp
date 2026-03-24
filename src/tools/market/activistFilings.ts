import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'get_activist_filings',
    'Get Schedule 13D/13G activist investor filings for a symbol. Shows when hedge funds or institutional investors take significant positions (5%+ ownership). 13D filings indicate activist intent; 13G filings indicate passive large holdings. Activist accumulation often precedes corporate actions that create options trading opportunities.',
    {
      symbol: z.string().describe('Ticker symbol'),
    },
    toolHandler(async ({ symbol }) => {
      return client.get(`/activist-filings/${encodeURIComponent(symbol.toUpperCase())}`);
    }),
  );
}
