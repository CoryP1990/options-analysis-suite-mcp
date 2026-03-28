import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';
import { shapeDividendCalendar } from './corporateActionsShaping.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'get_dividend_calendar',
    'Get the dividend calendar from Financial Modeling Prep data synced into the platform. Useful for upcoming ex-dates, record dates, payment dates, and near-term cash dividend events across symbols.',
    {
      from: z.string().optional().describe('Start date in YYYY-MM-DD format. Default is 7 days ago.'),
      to: z.string().optional().describe('End date in YYYY-MM-DD format. Default is 30 days ahead.'),
      limit: z.number().int().min(1).max(200).default(100).describe('Maximum number of dividend events to return (default 100, max 200).'),
      symbol: z.string().optional().describe('Optional ticker filter applied after fetching the calendar window.'),
    },
    toolHandler(async ({ from, to, limit, symbol }) => {
      const response = await client.get('/dividend-calendar', {
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
      });
      return shapeDividendCalendar(response, limit, symbol);
    }),
  );
}
