import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'get_market_regime',
    'Get the current market stress regime. Returns a composite stress score (0-100), confidence, key drivers (VIX, credit spreads, yield curve, correlation, breadth), and Greek exposure data (net gamma/delta/vega/vanna/charm/vomma, call/put walls, gamma flip). Above 60 = elevated stress with inflated option premiums. Below 30 = calm regime where selling premium tends to outperform. Use include_symbols=true to also get per-symbol regime breakdowns by sector.',
    {
      date: z.string().optional().describe('Specific date (YYYY-MM-DD), defaults to latest'),
      include_symbols: z.boolean().optional().describe('Include per-symbol regime breakdowns (~180KB). Default false — returns market summary only.'),
    },
    toolHandler(async ({ date, include_symbols }) => {
      const res = await client.get('/regime/current', date ? { date } : {}) as any;
      // Hoist Greek exposure data from vector._meta.gex to top level for discoverability
      if (res && typeof res === 'object' && 'market' in res) {
        const market = res.market;
        const gex = market?.vector?._meta?.gex;
        if (gex) {
          market.exposures = {
            netGamma: gex.netGamma, netDelta: gex.netDelta, netVega: gex.netVega,
            netVanna: gex.netVanna, netCharm: gex.netCharm, netVomma: gex.netVomma,
            callWall: gex.callWall, putWall: gex.putWall, gammaFlip: gex.gammaFlip,
            regime: gex.regime, topStrikes: gex.topStrikes,
          };
        }
      }
      if (include_symbols) return { _skipSizeGuard: true, data: res };
      if (res && typeof res === 'object' && 'market' in res) {
        return { market: res.market };
      }
      return res;
    }),
  );

  server.tool(
    'get_intraday_regime',
    'Get intraday regime scan history for a symbol. Shows how the regime evolved throughout the trading day across 5 scan intervals (open, morning, midday, afternoon, pre-close). Each scan includes stress scoring, regime classification, and 6 Greek exposure snapshots (gamma, delta, vega, vanna, charm, vomma) with dealer positioning and key gamma levels.',
    {
      symbol: z.string().describe('Ticker symbol (e.g. SPY, AAPL)'),
      days: z.number().int().min(1).max(90).default(5).describe('Number of days of history (default 5)'),
      date: z.string().optional().describe('Specific date (YYYY-MM-DD) — overrides days param'),
      interval: z.string().optional().describe('Filter to specific interval: open, morning, midday, afternoon, pre-close'),
    },
    toolHandler(async ({ symbol, days, date, interval }) => {
      const params: Record<string, string> = { days: String(days) };
      if (date) params.date = date;
      if (interval) params.interval = interval;
      const res = await client.get(`/regime/intraday/${encodeURIComponent(symbol)}`, params);
      return { _skipSizeGuard: true, data: res };
    }),
  );
}
