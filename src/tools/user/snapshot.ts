import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';
import {
  compactPortfolioHistoryResponse,
  dedupePortfolioSnapshotRecords,
  dedupeRiskSnapshotRecords,
  normalizePortfolioSnapshotSymbols,
  replaceDuplicatedDataField,
  shapePortfolioDetails,
  shapeRiskDetails,
  stripSyncRecordMetadata,
} from './syncResponseShaping.js';

/**
 * Unified user-snapshot tool. Replaces get_gex_snapshot /
 * get_portfolio_snapshot / get_risk_snapshot with one enum-driven
 * tool. Each type keeps its own shaping, dedupe, and response shape.
 */

const SNAPSHOT_DESCRIPTION = `Get the user's synced snapshot history by type. Default \`limit\` is 3 rows; increase or pass \`full=true\` for the raw history. Each type serves a different question:

• type="gex" — per-symbol Gamma Exposure snapshots. REQUIRED: \`symbol\`. Returns the 3 most recent snapshots (no dedupe — rows may be near-duplicates if recorded back-to-back). Includes per-expiration breakdown, call/put walls, gamma flip point, unusual activity, and expected move data.
• type="portfolio" — account-wide portfolio snapshots with market-scaled raw Greeks (no \$): first-order delta, gamma, theta/day, vega/1% IV, rho/1% rate; second-order vanna/1% IV, charm/day (delta decay), vomma/1% IV², veta/day (vega decay, sign-flipped for market convention). Default view collapses consecutive identical snapshots to surface the latest distinct states; per-position breakdowns are summarized unless full=true. For \$-impact views of the same Greeks, use type="risk".
• type="risk" — account-wide risk-analysis snapshots: Value-at-Risk (95%/99%), Conditional VaR, portfolio beta, Sharpe ratio, maximum drawdown, volatility, stress test results, and aggregate Greek \$-impact exposure. \$-Greeks include first-order dollarDelta, dollarGamma (per 1% move), dollarTheta/day, dollarVega (per 1% IV), dollarRho (per 1% rate) and second-order dollarVanna (per 1% IV move), dollarCharm (daily \$Δ decay), dollarVomma (per 1% IV), dollarVeta (daily vega decay). Default view collapses consecutive identical snapshots; correlation matrices omitted unless full=true. For raw-unit Greeks, use type="portfolio".`;

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'get_snapshot',
    SNAPSHOT_DESCRIPTION,
    {
      type: z.enum(['gex', 'portfolio', 'risk']).describe('Which snapshot feed to fetch.'),
      symbol: z.string().optional().describe('Required for type=gex; ignored otherwise.'),
      limit: z.number().int().min(1).max(50).default(3).describe('Max snapshots (default 3)'),
      full: z.boolean().default(false).describe('Return the full untrimmed payload including detail tables, correlation matrices, and per-position breakdowns.'),
    },
    toolHandler(async ({ type, symbol, limit, full }) => {
      if (type === 'gex') {
        if (!symbol) throw new Error("type='gex' requires `symbol`");
        const res = await client.get('/sync/analysis-data', { type: 'gex', symbol, limit: String(limit) }) as any;
        if (full && res != null) return { _skipSizeGuard: true, data: res };
        // Details contain per-expiration arrays — strip those and keep summary
        // Key GEX fields (gammaFlip, callWall, putWall) live on the summary record (record.data), not details
        if (res && Array.isArray(res.data)) {
          res.data = res.data.map((record: any) => {
            stripSyncRecordMetadata(record);
            if (record.details && typeof record.details === 'object') {
              const d = record.details;
              if (Array.isArray(d)) {
                record.details = { _note: `${d.length} expiration breakdowns omitted — request full data if needed.` };
              } else {
                const summary: Record<string, unknown> = {};
                const omitted: string[] = [];
                for (const [k, v] of Object.entries(d)) {
                  if (Array.isArray(v)) { omitted.push(k); } else { summary[k] = v; }
                }
                if (omitted.length) summary._note = `${omitted.join(', ')} omitted — request full data if needed.`;
                record.details = summary;
              }
            }
            replaceDuplicatedDataField(record, 'details', '[see top-level details]');
            return record;
          });
        }
        return res;
      }

      if (type === 'portfolio') {
        const fetchLimit = full ? limit : Math.min(limit * 5, 50);
        const res = await client.get('/sync/analysis-data', { type: 'portfolio', limit: String(fetchLimit) }) as any;
        if (full && res != null) return { _skipSizeGuard: true, data: res };
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
      }

      // type === 'risk'
      const fetchLimit = full ? limit : Math.min(limit * 5, 50);
      const res = await client.get('/sync/analysis-data', { type: 'risk', limit: String(fetchLimit) }) as any;
      if (full && res != null) return { _skipSizeGuard: true, data: res };
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
