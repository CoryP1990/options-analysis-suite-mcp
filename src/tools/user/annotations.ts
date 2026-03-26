import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'get_user_annotations',
    'Get the user\'s research notes, tags, and alerts. These are personal annotations the user has attached to specific symbols or analyses.',
    {
      symbol: z.string().optional().describe('Filter by ticker symbol'),
      limit: z.number().int().min(1).max(100).default(20).describe('Max annotations (default 20)'),
    },
    toolHandler(async ({ symbol, limit }) => {
      const params: Record<string, string> = { type: 'annotations', limit: String(limit) };
      if (symbol) params.symbol = symbol;
      return client.get('/sync/analysis-data', params);
    }, { isSyncTool: true }),
  );
}
