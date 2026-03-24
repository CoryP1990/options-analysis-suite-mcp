import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'get_economic_calendar',
    'Get upcoming macro economic events (FOMC, CPI, NFP, GDP, etc.) that can impact options volatility and market regime. Useful for timing trades around catalysts and avoiding vol crush.',
    {},
    toolHandler(async () => {
      const res = await client.get('/economic-calendar') as any;

      const cap = 20;
      if (Array.isArray(res)) {
        if (res.length > cap) {
          return {
            _note: `Trimmed from ${res.length} to next ${cap} events.`,
            events: res.slice(0, cap),
          };
        }
        return res;
      }
      for (const key of Object.keys(res ?? {})) {
        if (Array.isArray(res[key]) && res[key].length > cap) {
          res[`_${key}_note`] = `Trimmed from ${res[key].length} to next ${cap} events.`;
          res[key] = res[key].slice(0, cap);
        }
      }
      return res;
    }),
  );
}
