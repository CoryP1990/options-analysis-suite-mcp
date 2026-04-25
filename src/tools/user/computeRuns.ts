import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';
import { recordMatchesComputeFilters, summarizeComputeRunsResponse } from './computeRunsShaping.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.registerTool(
    'get_compute_runs',
    {
      title: 'AI Compute Suite Runs',
      description: 'Get the user\'s AI Compute Suite run history — portfolio-wide batch analyses across multiple pricing models. Default response returns compact run summaries, model-dispersion highlights, exposure key levels, and representative position/model outputs.',
      inputSchema: {
        run_key: z.string().optional().describe('Exact run key for one specific compute run'),
        status: z.enum(['running', 'completed', 'cancelled', 'failed']).optional().describe('Filter by run status'),
        scope: z.enum(['core', 'full']).optional().describe('Filter by compute scope'),
        quality: z.enum(['balanced', 'precise']).optional().describe('Filter by compute quality'),
        underlying: z.string().optional().describe('Only runs containing this underlying symbol'),
        limit: z.number().int().min(1).max(50).default(5).describe('Max runs to return (default 5)'),
        since: z.string().optional().describe('Only runs after this date (ISO format)'),
        full: z.boolean().default(false).describe('Return the raw synced compute-run rows instead of the compact assistant view'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    toolHandler(async ({ run_key, status, scope, quality, underlying, limit, since, full }) => {
      const fetchLimit = run_key ? 200 : full ? Math.min(limit, 50) : Math.min(limit * 5, 200);
      const res = await client.get('/sync/analysis-data', {
        type: 'compute',
        limit: String(fetchLimit),
        ...(since ? { since } : {}),
      }) as any;

      if (res && Array.isArray(res.data)) {
        res.data = res.data
          .filter((record: unknown) => recordMatchesComputeFilters(record, {
            runKey: run_key,
            status,
            scope,
            quality,
            underlying,
          }))
          .slice(0, limit);
        res.count = res.data.length;
      }

      if (full && res != null) return { _skipSizeGuard: true, data: res };
      return summarizeComputeRunsResponse(res);
    }, { isSyncTool: true }),
  );
}
