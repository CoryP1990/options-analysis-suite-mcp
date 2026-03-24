import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'get_iv_surface',
    'Get the IV surface/skew across strikes and expirations for a symbol. End-of-day data from the previous trading session. Useful for analyzing volatility smile/smirk, identifying mispriced strikes, and comparing term structure across expirations.',
    {
      symbol: z.string().describe('Ticker symbol (e.g., AAPL, SPY)'),
    },
    toolHandler(async ({ symbol }) => {
      return client.get(`/scanner/iv-surface/${encodeURIComponent(symbol.toUpperCase())}`);
    }),
  );
}
