import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';
import { dedupeRiskSnapshotRecords, replaceDuplicatedDataField, shapeRiskDetails, stripSyncRecordMetadata } from './syncResponseShaping.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'get_risk_snapshot',
    'Get the user\'s risk analysis snapshots: Value-at-Risk (95%/99%), Conditional VaR, portfolio beta, Sharpe ratio, maximum drawdown, volatility, and stress test results. Returns 3 most recent distinct snapshots by default; increase limit for more. Correlation matrices omitted — request full data if needed.',
    {
      limit: z.number().int().min(1).max(50).default(3).describe('Max snapshots (default 3)'),
      full: z.boolean().default(false).describe('Return full untrimmed data including detail tables, correlation matrices, and per-position breakdowns'),
    },
    toolHandler(async ({ limit, full }) => {
      const fetchLimit = full ? limit : Math.min(limit * 5, 50);
      const res = await client.get('/sync/analysis-data', { type: 'risk', limit: String(fetchLimit) }) as any;
      if (full && res != null) return { _skipSizeGuard: true, data: res };
      // Remove correlation matrix and MC details to reduce token usage
      // Backend fields: correlationMatrix, mcVarDetails (not monteCarloSimulation)
      if (res && Array.isArray(res.data)) {
        res.data = res.data.map((record: any) => {
          stripSyncRecordMetadata(record);
          if (record.details && typeof record.details === 'object') {
            record.details = shapeRiskDetails(record.details);
          }
          replaceDuplicatedDataField(record, 'details', '[see top-level details]');
          return record;
        });
        const deduped = dedupeRiskSnapshotRecords(res.data, limit);
        res.data = deduped.records;
        res.count = res.data.length;
        if (deduped.omittedCount > 0) {
          res._dedupe_note = `Collapsed ${deduped.omittedCount} repeated identical snapshots from the default view so the latest distinct states fit. Use full=true for the raw history.`;
        }
      }
      return res;
    }, { isSyncTool: true }),
  );
}
