import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'get_trading_halts',
    'Get current and recent trading halts. Shows LULD (Limit Up-Limit Down) halts, news-pending halts, and regulatory halts. Trading halts create volatility spikes and affect options pricing — check before entering positions on a halted or recently-halted stock.',
    {
      symbol: z.string().optional().describe('Ticker symbol (optional — omit for all current halts)'),
    },
    toolHandler(async ({ symbol }) => {
      if (symbol) {
        return client.get(`/market/trading-halts/${encodeURIComponent(symbol.toUpperCase())}`);
      }
      return client.get('/market/trading-halts');
    }),
  );
}
