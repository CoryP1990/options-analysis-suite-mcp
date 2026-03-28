import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';
import { shapeIpoCalendar } from './corporateActionsShaping.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'get_ipo_calendar',
    'Get the IPO calendar from Financial Modeling Prep data synced into the platform. Useful for upcoming listings, recent IPO activity, and event-driven research around newly public companies.',
    {
      from: z.string().optional().describe('Start date in YYYY-MM-DD format. Default is 30 days ago.'),
      to: z.string().optional().describe('End date in YYYY-MM-DD format. Default is 60 days ahead.'),
      limit: z.number().int().min(1).max(200).default(50).describe('Maximum number of IPO events to return (default 50, max 200).'),
      symbol: z.string().optional().describe('Optional ticker filter applied after fetching the calendar window.'),
    },
    toolHandler(async ({ from, to, limit, symbol }) => {
      const response = await client.get('/ipo-calendar', {
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
      });
      return shapeIpoCalendar(response, limit, symbol);
    }),
  );
}
