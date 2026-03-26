import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'get_analysis_history',
    'Get the user\'s options pricing analysis history — past calculations run in the platform. Each result includes the model used (Black-Scholes, Heston, SABR, etc.), input parameters (spot, strike, volatility, DTE), computed option price, and Greeks. Includes calibration data and model-specific sensitivities when available. Returns 10 results by default; increase limit for more.',
    {
      symbol: z.string().optional().describe('Filter by ticker symbol'),
      model: z.string().optional().describe('Filter by pricing model (e.g., BlackScholes, Heston)'),
      limit: z.number().int().min(1).max(200).default(10).describe('Max results (default 10)'),
      since: z.string().optional().describe('Only results after this date (ISO format)'),
      full: z.boolean().default(false).describe('Return full untrimmed data including detail tables, correlation matrices, and per-position breakdowns'),
    },
    toolHandler(async ({ symbol, model, limit, since, full }) => {
      const params: Record<string, string> = { type: 'results', limit: String(limit) };
      if (symbol) params.symbol = symbol;
      if (model) params.model = model;
      if (since) params.since = since;
      const res = await client.get('/sync/analysis-data', params) as any;
      if (full && res != null) return { _skipSizeGuard: true, data: res };
      // For each record, flatten deeply nested data to top-level keys only
      if (res && Array.isArray(res.data)) {
        res.data = res.data.map((record: any) => {
          if (record.data && typeof record.data === 'object') {
            record.data = Object.fromEntries(
              Object.entries(record.data).map(([k, v]) =>
                [k, typeof v === 'object' && v !== null && !Array.isArray(v) ? '[nested object]' : v]
              )
            );
          }
          return record;
        });
      }
      return res;
    }, { isSyncTool: true }),
  );
}
