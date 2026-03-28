import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';
import { summarizeEconomicCalendar } from './economicCalendarShaping.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'get_economic_calendar',
    'Get upcoming macro economic events (FOMC, CPI, NFP, GDP, etc.) that can impact options volatility and market regime. Default response focuses on higher-signal macro catalysts; use from/to, country, or full=true for broader raw calendar data.',
    {
      from: z.string().optional().describe('Start date (YYYY-MM-DD), defaults to today'),
      to: z.string().optional().describe('End date (YYYY-MM-DD), defaults to 30 days ahead'),
      country: z.string().optional().describe('Optional country filter (e.g. US, EU, UK)'),
      full: z.boolean().optional().describe('Return the full raw calendar feed and bypass the default catalyst-focused summary. Use with from/to or country filters for narrower windows.'),
    },
    toolHandler(async ({ from, to, country, full }) => {
      const params: Record<string, string> = {};
      if (from) params.from = from;
      if (to) params.to = to;
      if (country) params.country = country.toUpperCase();

      const res = await client.get('/economic-calendar', params) as any;
      if (full) return { _skipSizeGuard: true, data: Array.isArray(res) ? { events: res } : res };
      return summarizeEconomicCalendar(res);
    }),
  );
}
