import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'get_risk_snapshot',
    'Get the user\'s risk analysis snapshots: Value-at-Risk (95%/99%), Conditional VaR, portfolio beta, Sharpe ratio, maximum drawdown, volatility, and stress test results. Returns 3 most recent snapshots by default; increase limit for more. Correlation matrices omitted — request full data if needed.',
    {
      limit: z.number().int().min(1).max(50).default(3).describe('Max snapshots (default 3)'),
      full: z.boolean().default(false).describe('Return full untrimmed data including detail tables, correlation matrices, and per-position breakdowns'),
    },
    toolHandler(async ({ limit, full }) => {
      const res = await client.get('/sync/analysis-data', { type: 'risk', limit: String(limit) }) as any;
      if (full && res != null) return { _skipSizeGuard: true, data: res };
      // Remove correlation matrix and MC details to reduce token usage
      // Backend fields: correlationMatrix, mcVarDetails (not monteCarloSimulation)
      if (res && Array.isArray(res.data)) {
        res.data = res.data.map((record: any) => {
          if (record.details && typeof record.details === 'object') {
            const d = record.details;
            const { correlationMatrix, mcVarDetails, ...summaryStats } = d;
            record.details = {
              ...summaryStats,
              _note: [
                correlationMatrix ? 'Correlation matrix omitted.' : '',
                mcVarDetails ? 'Monte Carlo VaR details omitted.' : '',
                'Request full data if needed.',
              ].filter(Boolean).join(' '),
            };
          }
          return record;
        });
      }
      return res;
    }, { isSyncTool: true }),
  );
}
