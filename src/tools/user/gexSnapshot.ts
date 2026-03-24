import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'get_gex_snapshot',
    'Get the user\'s saved Gamma Exposure (GEX) snapshots for a symbol. GEX measures how market makers\' hedging creates support/resistance levels. Includes per-expiration breakdown, call/put walls, gamma flip point, unusual activity, and expected move data. Returns 3 most recent snapshots by default; increase limit for more.',
    {
      symbol: z.string().describe('Ticker symbol'),
      limit: z.number().int().min(1).max(50).default(3).describe('Max snapshots (default 3)'),
      full: z.boolean().default(false).describe('Return full untrimmed data including detail tables, correlation matrices, and per-position breakdowns'),
    },
    toolHandler(async ({ symbol, limit, full }) => {
      const res = await client.get('/sync/analysis-data', { type: 'gex', symbol, limit: String(limit) }) as any;
      // Details contain per-expiration arrays — strip those and keep summary
      // Key GEX fields (gammaFlip, callWall, putWall) live on the summary record (record.data), not details
      if (!full && res && Array.isArray(res.data)) {
        res.data = res.data.map((record: any) => {
          if (record.details && typeof record.details === 'object') {
            const d = record.details;
            // Details is an array of per-expiration breakdowns — summarize
            if (Array.isArray(d)) {
              record.details = { _note: `${d.length} expiration breakdowns omitted — request full data if needed.` };
            } else {
              // Object form — keep top-level scalars, omit arrays
              const summary: Record<string, unknown> = {};
              const omitted: string[] = [];
              for (const [k, v] of Object.entries(d)) {
                if (Array.isArray(v)) { omitted.push(k); } else { summary[k] = v; }
              }
              if (omitted.length) summary._note = `${omitted.join(', ')} omitted — request full data if needed.`;
              record.details = summary;
            }
          }
          return record;
        });
      }
      return res;
    }),
  );
}
