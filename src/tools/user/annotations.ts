import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';
import { stripSyncRecordMetadata } from './syncResponseShaping.js';
import { shapeAnnotationsResponse } from './annotationsShaping.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.registerTool(
    'get_user_annotations',
    {
      title: 'User Annotations',
      description: 'Get the user\'s research notes, tags, and alerts. These are personal annotations the user has attached to specific symbols or analyses.',
      inputSchema: {
        symbol: z.string().optional().describe('Filter by ticker symbol'),
        limit: z.number().int().min(1).max(100).default(20).describe('Max annotations (default 20)'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    toolHandler(async ({ symbol, limit }) => {
      const params: Record<string, string> = { type: 'annotations', limit: String(limit) };
      if (symbol) params.symbol = symbol;
      const res = await client.get('/sync/analysis-data', params) as any;
      if (res && Array.isArray(res.data)) {
        for (const record of res.data) stripSyncRecordMetadata(record);
      }
      return shapeAnnotationsResponse(res);
    }, { isSyncTool: true }),
  );
}
