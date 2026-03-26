import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'get_analysis_rollups',
    'Get pre-computed daily or weekly aggregates of the user\'s analysis activity per symbol. Shows average Greeks, volatility ranges, and model usage patterns over time. Useful for spotting trends — e.g., "AAPL average implied vol has been trending up in your analyses over the past 2 weeks".',
    {
      symbol: z.string().describe('Ticker symbol'),
      period: z.enum(['day', 'week']).default('day').describe('Aggregation period'),
      limit: z.number().int().min(1).max(90).default(10).describe('Max periods (default 10). Increase up to 90 for longer trends.'),
    },
    toolHandler(async ({ symbol, period, limit }) => {
      return client.get('/sync/analysis-data', { type: 'rollups', symbol, period, limit: String(limit) });
    }, { isSyncTool: true }),
  );
}
