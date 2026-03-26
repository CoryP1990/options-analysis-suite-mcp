import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';

/** Hoist vector._meta.gex to a top-level exposures object, then strip raw vector to save tokens */
function hoistExposures(entry: any): any {
  const gex = entry?.vector?._meta?.gex;
  if (gex) {
    entry.exposures = {
      spotPrice: gex.spotPrice,
      netGamma: gex.netGamma, netDelta: gex.netDelta, netVega: gex.netVega,
      netVanna: gex.netVanna, netCharm: gex.netCharm, netVomma: gex.netVomma,
      callWall: gex.callWall, putWall: gex.putWall, gammaFlip: gex.gammaFlip,
      regime: gex.regime, topStrikes: gex.topStrikes,
    };
  }
  // Remove raw vector to avoid duplicating exposure data in response
  delete entry.vector;
  return entry;
}

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'get_regime_symbol',
    'Get regime classification and authoritative Greek exposure data for a single symbol. Returns stress score, regime label, drivers, and all 6 dealer-perspective exposures: net gamma, delta, vega, vanna, charm, vomma plus call/put walls, gamma flip level, and top 10 strikes by gamma. This is the correct tool for questions like "what are SPY\'s Greek exposures?" — do NOT use get_options_analytics_history for current exposure levels.',
    {
      symbol: z.string().describe('Ticker symbol (e.g., SPY, AAPL, QQQ)'),
      days: z.number().int().min(1).max(30).default(1).describe('Days of history (default 1 = latest only, max 30)'),
      full: z.boolean().optional().describe('Return full data including raw vector for multi-day requests. Default false.'),
    },
    toolHandler(async ({ symbol, days, full }) => {
      const res = await client.get(`/regime/symbol/${encodeURIComponent(symbol.toUpperCase())}`, {
        days: String(days),
      }) as any;

      if (!res?.history?.length) return null;

      if (full) {
        // Full mode: hoist exposures but keep raw vector intact
        for (const entry of res.history) {
          const gex = entry?.vector?._meta?.gex;
          if (gex) {
            entry.exposures = {
              spotPrice: gex.spotPrice,
              netGamma: gex.netGamma, netDelta: gex.netDelta, netVega: gex.netVega,
              netVanna: gex.netVanna, netCharm: gex.netCharm, netVomma: gex.netVomma,
              callWall: gex.callWall, putWall: gex.putWall, gammaFlip: gex.gammaFlip,
              regime: gex.regime, topStrikes: gex.topStrikes,
            };
          }
        }
        return { _skipSizeGuard: true, data: res };
      }

      // Default: hoist exposures and strip raw vector to save tokens
      for (const entry of res.history) {
        hoistExposures(entry);
      }

      // Always return the latest entry for days=1 (proxy may return multiple for same calendar day)
      if (days === 1) {
        const latest = res.history[res.history.length - 1];
        return {
          symbol: res.symbol,
          scope: res.scope,
          ...latest,
        };
      }

      return res;
    }),
  );
}
