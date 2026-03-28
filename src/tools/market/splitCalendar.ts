import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';
import { shapeSplitCalendar } from './corporateActionsShaping.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'get_split_calendar',
    'Get the stock split calendar from Financial Modeling Prep data synced into the platform. Useful for upcoming or recent split events, ratio changes, and interpreting major price-history discontinuities.',
    {
      from: z.string().optional().describe('Start date in YYYY-MM-DD format. Default is 30 days ago.'),
      to: z.string().optional().describe('End date in YYYY-MM-DD format. Default is 60 days ahead.'),
      limit: z.number().int().min(1).max(200).default(100).describe('Maximum number of split events to return (default 100, max 200).'),
      symbol: z.string().optional().describe('Optional ticker filter applied after fetching the calendar window.'),
    },
    toolHandler(async ({ from, to, limit, symbol }) => {
      const response = await client.get('/split-calendar', {
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
      });
      return shapeSplitCalendar(response, limit, symbol);
    }),
  );
}
