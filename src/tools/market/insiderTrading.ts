import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'get_insider_trading',
    'Get SEC Form 4 insider trading filings for a company. Shows recent purchases and sales by officers, directors, and 10% holders. Cluster buying by insiders (especially after an IV spike) can signal puts are overpriced. Returns 10 most recent trades by default; request more with specific date range if needed.',
    {
      symbol: z.string().describe('Ticker symbol'),
    },
    toolHandler(async ({ symbol }) => {
      const res = await client.get(`/insider-trading/${encodeURIComponent(symbol.toUpperCase())}`) as any;
      // Backend returns insider_trades array — cap to 10 most recent
      if (res && Array.isArray(res.insider_trades) && res.insider_trades.length > 10) {
        res._insider_trades_note = `Showing 10 most recent of ${res.insider_trades.length} filings.`;
        res.insider_trades = res.insider_trades.slice(0, 10);
      }
      return res;
    }),
  );
}
