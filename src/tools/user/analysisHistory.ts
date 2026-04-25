import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';
import {
  compactAnalysisHistoryResponse,
  dedupeAnalysisHistoryRecords,
  shapeAnalysisResultRecord,
} from './syncResponseShaping.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.registerTool(
    'get_analysis_history',
    {
      title: 'Analysis History',
      description: 'Get the user\'s options pricing analysis history — past calculations run in the platform. Each result includes the model used (Black-Scholes, Heston, SABR, etc.), input parameters (spot, strike, volatility, DTE), computed option price, and Greeks. Includes calibration data and model-specific sensitivities when available. Default view collapses near-identical reruns from the same pricing sweep; use full=true for the raw history.',
      inputSchema: {
        symbol: z.string().optional().describe('Filter by ticker symbol'),
        model: z.string().optional().describe('Filter by pricing model (e.g., BlackScholes, Heston)'),
        limit: z.number().int().min(1).max(200).default(10).describe('Max results (default 10)'),
        since: z.string().optional().describe('Only results after this date (ISO format)'),
        full: z.boolean().default(false).describe('Return full untrimmed data including detail tables, correlation matrices, and per-position breakdowns'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    toolHandler(async ({ symbol, model, limit, since, full }) => {
      const fetchLimit = full ? limit : Math.min(limit * 5, 200);
      const params: Record<string, string> = { type: 'results', limit: String(fetchLimit) };
      if (symbol) params.symbol = symbol;
      if (model) params.model = model;
      if (since) params.since = since;
      const res = await client.get('/sync/analysis-data', params) as any;
      if (full && res != null) return { _skipSizeGuard: true, data: res };
      if (res && Array.isArray(res.data)) {
        const deduped = dedupeAnalysisHistoryRecords(res.data, limit);
        res.data = deduped.records;
        res.count = res.data.length;
        if (deduped.omittedCount > 0) {
          res._dedupe_note = `Collapsed ${deduped.omittedCount} near-identical reruns from the default view. Use full=true for the raw history.`;
        }
        for (const record of res.data) shapeAnalysisResultRecord(record);
        compactAnalysisHistoryResponse(res);
      }
      return res;
    }, { isSyncTool: true }),
  );
}
