import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'query_analysis',
    'Query your analysis history with filters. Find specific analyses by greek values, volatility ranges, or other criteria. For example: "analyses where delta > 0.7" or "all Heston runs with IV below 30%".',
    {
      symbol: z.string().optional().describe('Filter by ticker symbol'),
      model: z.string().optional().describe('Filter by pricing model (e.g., BlackScholes, Heston)'),
      since: z.string().optional().describe('Only results after this date (ISO format)'),
      minDelta: z.number().optional().describe('Minimum delta value'),
      maxDelta: z.number().optional().describe('Maximum delta value'),
      minVolatility: z.number().optional().describe('Minimum volatility (e.g., 0.25 for 25%)'),
      maxVolatility: z.number().optional().describe('Maximum volatility (e.g., 0.50 for 50%)'),
      minDte: z.number().optional().describe('Minimum days to expiry'),
      maxDte: z.number().optional().describe('Maximum days to expiry'),
      limit: z.number().int().min(1).max(100).default(20).describe('Max results (default 20)'),
    },
    toolHandler(async ({ symbol, model, since, minDelta, maxDelta, minVolatility, maxVolatility, minDte, maxDte, limit }) => {
      // Fetch a larger set from the server to allow client-side filtering
      const fetchLimit = Math.min(limit * 5, 200);
      const params: Record<string, string> = { type: 'results', limit: String(fetchLimit) };
      if (symbol) params.symbol = symbol;
      if (model) params.model = model;
      if (since) params.since = since;

      const res = await client.get('/sync/analysis-data', params) as any;
      if (!res || !Array.isArray(res.data)) return res;

      const hasNumericFilters = minDelta !== undefined || maxDelta !== undefined ||
        minVolatility !== undefined || maxVolatility !== undefined ||
        minDte !== undefined || maxDte !== undefined;

      if (!hasNumericFilters) {
        // No numeric filters — just trim to requested limit
        res.data = res.data.slice(0, limit);
        res.count = res.data.length;
        return res;
      }

      // Client-side filtering on numeric fields from record.data and record.facts
      const fetchedAll = res.data.length < fetchLimit;
      res.data = res.data.filter((record: any) => {
        const data = record.data || {};
        const facts = record.facts || {};
        const greeks = data.greeks || {};

        // Extract delta: check facts.delta, greeks.delta, data.delta
        const delta = facts.delta ?? greeks.delta ?? data.delta;
        if (minDelta !== undefined && (delta == null || delta < minDelta)) return false;
        if (maxDelta !== undefined && (delta == null || delta > maxDelta)) return false;

        // Extract volatility: check facts.volatility, data.volatility, data.impliedVolatility
        const vol = facts.volatility ?? data.volatility ?? data.impliedVolatility;
        if (minVolatility !== undefined && (vol == null || vol < minVolatility)) return false;
        if (maxVolatility !== undefined && (vol == null || vol > maxVolatility)) return false;

        // Extract DTE: check facts.daysToMaturity, data.daysToMaturity, data.dte
        const dte = facts.daysToMaturity ?? data.daysToMaturity ?? data.dte;
        if (minDte !== undefined && (dte == null || dte < minDte)) return false;
        if (maxDte !== undefined && (dte == null || dte > maxDte)) return false;

        return true;
      }).slice(0, limit);

      res.count = res.data.length;
      if (!fetchedAll && res.data.length < limit) {
        res._query_note = `Searched ${fetchLimit} most recent records. More records may exist that match your filters — try narrowing by symbol, model, or date range.`;
      }
      return res;
    }, { isSyncTool: true }),
  );
}
