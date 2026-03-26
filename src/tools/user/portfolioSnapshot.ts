import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'get_portfolio_snapshot',
    'Get the user\'s portfolio snapshots showing position count, total value, P&L, aggregate Greeks (delta, gamma, theta, vega), and summary allocation. Returns 3 most recent snapshots by default; increase limit for more. Per-position breakdowns are summarized — request full data for individual positions.',
    {
      limit: z.number().int().min(1).max(50).default(3).describe('Max snapshots (default 3)'),
      full: z.boolean().default(false).describe('Return full untrimmed data including detail tables, correlation matrices, and per-position breakdowns'),
    },
    toolHandler(async ({ limit, full }) => {
      const res = await client.get('/sync/analysis-data', { type: 'portfolio', limit: String(limit) }) as any;
      if (full && res != null) return { _skipSizeGuard: true, data: res };
      // Keep aggregate summary, strip heavy per-position arrays
      // Backend detail fields: positionGreeks (array), fullAllocation (array), marginDetails, etc.
      if (res && Array.isArray(res.data)) {
        res.data = res.data.map((record: any) => {
          if (record.details && typeof record.details === 'object') {
            const d = record.details;
            const omitted: string[] = [];
            const summary: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(d)) {
              if (Array.isArray(v)) {
                omitted.push(`${k}(${v.length})`);
              } else {
                summary[k] = v;
              }
            }
            if (omitted.length) summary._note = `Per-position arrays omitted: ${omitted.join(', ')}. Request full data for breakdown.`;
            record.details = summary;
          }
          return record;
        });
      }
      return res;
    }, { isSyncTool: true }),
  );
}
