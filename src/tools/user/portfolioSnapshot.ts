import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';
import {
  compactPortfolioHistoryResponse,
  dedupePortfolioSnapshotRecords,
  normalizePortfolioSnapshotSymbols,
  replaceDuplicatedDataField,
  shapePortfolioDetails,
  stripSyncRecordMetadata,
} from './syncResponseShaping.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'get_portfolio_snapshot',
    'Get the user\'s portfolio snapshots showing position count, total value, P&L, aggregate Greeks (delta, gamma, theta, vega), and summary allocation. Returns 3 most recent distinct snapshots by default; increase limit for more. Per-position breakdowns are summarized — request full data for individual positions.',
    {
      limit: z.number().int().min(1).max(50).default(3).describe('Max snapshots (default 3)'),
      full: z.boolean().default(false).describe('Return full untrimmed data including detail tables, correlation matrices, and per-position breakdowns'),
    },
    toolHandler(async ({ limit, full }) => {
      const fetchLimit = full ? limit : Math.min(limit * 5, 50);
      const res = await client.get('/sync/analysis-data', { type: 'portfolio', limit: String(fetchLimit) }) as any;
      if (full && res != null) return { _skipSizeGuard: true, data: res };
      // Keep aggregate summary, strip heavy per-position arrays
      // Backend detail fields: positionGreeks (array), fullAllocation (array), marginDetails, etc.
      if (res && Array.isArray(res.data)) {
        res.data = res.data.map((record: any) => {
          stripSyncRecordMetadata(record);
          normalizePortfolioSnapshotSymbols(record);
          if (record.details && typeof record.details === 'object') {
            record.details = shapePortfolioDetails(record.details);
          }
          replaceDuplicatedDataField(record, 'details', '[see top-level details]');
          return record;
        });
        const deduped = dedupePortfolioSnapshotRecords(res.data, limit);
        res.data = deduped.records;
        res.count = res.data.length;
        if (deduped.omittedCount > 0) {
          res._dedupe_note = `Collapsed ${deduped.omittedCount} repeated identical snapshots from the default view so the latest distinct states fit. Use full=true for the raw history.`;
        }
        compactPortfolioHistoryResponse(res);
      }
      return res;
    }, { isSyncTool: true }),
  );
}
