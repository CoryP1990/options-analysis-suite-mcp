import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'get_fundamentals',
    'Get company fundamentals: market cap, P/E ratio, EPS, revenue, profit margins, dividend yield, beta, sector, and industry. Useful for assessing whether an options strategy aligns with the fundamental picture. Returns TTM ratios, key metrics, and the most recent financial statement entry by default. Use full=true to include all financial statements (income, balance sheet, cash flow).',
    {
      symbol: z.string().describe('Ticker symbol'),
      full: z.boolean().optional().describe('Include full financial statements (annual + quarterly). Default false — returns TTM ratios, key metrics, and one recent statement entry.'),
    },
    toolHandler(async ({ symbol, full }) => {
      const res = await client.get(`/fundamentals/${encodeURIComponent(symbol.toUpperCase())}`);
      if (full) return { _skipSizeGuard: true, data: res };
      if (res && typeof res === 'object') {
        const data = res as Record<string, unknown>;
        return {
          symbol: data.symbol,
          ratios_ttm: data.ratios_ttm,
          key_metrics_ttm: data.key_metrics_ttm,
          income_stmt: Array.isArray(data.income_stmt) ? data.income_stmt.slice(0, 1) : undefined,
          balance_sheet: Array.isArray(data.balance_sheet) ? data.balance_sheet.slice(0, 1) : undefined,
          cash_flow: Array.isArray(data.cash_flow) ? data.cash_flow.slice(0, 1) : undefined,
          fetched_at: data.fetched_at,
        };
      }
      return res;
    }),
  );
}
