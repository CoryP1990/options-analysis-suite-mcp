import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';
import { shapeMarketRegimeResponse } from './marketRegimeShaping.js';

/**
 * Unified regime tool. Replaces get_market_regime, get_intraday_regime,
 * and get_regime_symbol with one enum-driven tool. Each scope keeps
 * its own params, defaults, and response shape.
 */

const STRESS_SCORE_NOTE = 'stress_score is a raw composite regime score, not a 0-100 index. Typical bands: CALM < -0.5, NORMAL -0.5 to 0.5, ELEVATED 0.5 to 1.5, STRESS 1.5 to 2.5, CRISIS >= 2.5.';

const REGIME_DESCRIPTION = `Get regime data at one of three scopes. Pick the scope that matches the question; irrelevant sub-params are ignored.

• scope="market" — MARKET COMPOSITE stress regime (aggregate across SPY/QQQ/IWM/DIA, not per-symbol). Returns composite stress score, confidence, key drivers, feature z-scores. Bands: CALM < -0.5, NORMAL -0.5..0.5, ELEVATED 0.5..1.5, STRESS 1.5..2.5, CRISIS ≥ 2.5. Accepts \`date\` (YYYY-MM-DD, default latest) and \`include_symbols\` (default false; true returns ~180KB with all 124 per-symbol breakdowns and the raw regime payload).
• scope="symbol" — per-symbol daily regime + authoritative Greek exposures (net gamma/delta/vega/vanna/charm/vomma, call wall, put wall, gamma flip, top 10 gamma strikes). REQUIRED: \`symbol\`. Accepts \`days\` (default 1 = latest, max 30) and \`full\` (default false; true keeps raw vector). This is the correct scope for "what are SPY's Greek exposures?" — do NOT use get_options_analytics_history for current exposures.
• scope="intraday" — intraday regime scan history for a symbol: 5 scans/day (open, morning, midday, afternoon, pre-close), each with stress scoring, regime classification, and 6 Greek exposure snapshots. REQUIRED: \`symbol\`. Accepts \`days\` (default 5, max 90), \`date\` (overrides days), and \`interval\` (filter to a single scan).`;

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
  delete entry.vector;
  return entry;
}

export function register(server: McpServer, client: ProxyClient): void {
  server.registerTool(
    'get_regime',
    {
      title: 'Market Regime',
      description: REGIME_DESCRIPTION,
      inputSchema: {
        scope: z.enum(['market', 'symbol', 'intraday']).describe('Which regime view to fetch.'),
        symbol: z.string().optional().describe('Required for scope=symbol or scope=intraday.'),
        date: z.string().optional().describe('Specific date (YYYY-MM-DD). For scope=market: default is latest. For scope=intraday: overrides `days`.'),
        days: z.number().int().min(1).max(90).optional().describe('For scope=symbol: history days (default 1, max 30). For scope=intraday: history days (default 5, max 90).'),
        interval: z.string().optional().describe('For scope=intraday only: filter to open | morning | midday | afternoon | pre-close.'),
        include_symbols: z.boolean().optional().describe('For scope=market only: include all 124 per-symbol breakdowns (~180KB). Default false.'),
        full: z.boolean().optional().describe('For scope=symbol only: keep raw vector for multi-day requests. Default false.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    toolHandler(async ({ scope, symbol, date, days, interval, include_symbols, full }) => {
      if (scope === 'market') {
        const res = await client.get('/regime/current', date ? { date } : {}) as any;
        // Hoist Greek exposure data from vector._meta.gex to top level for discoverability
        if (res && typeof res === 'object') {
          if (res.market) {
            res.market._stress_score_note = STRESS_SCORE_NOTE;
            const gex = res.market?.vector?._meta?.gex;
            if (gex) {
              res.market.exposures = {
                spotPrice: gex.spotPrice,
                netGamma: gex.netGamma, netDelta: gex.netDelta, netVega: gex.netVega,
                netVanna: gex.netVanna, netCharm: gex.netCharm, netVomma: gex.netVomma,
                callWall: gex.callWall, putWall: gex.putWall, gammaFlip: gex.gammaFlip,
                regime: gex.regime,
              };
            }
          }
          if (res.symbols) {
            res._stress_score_note = STRESS_SCORE_NOTE;
            for (const scopeRows of Object.values(res.symbols) as any[][]) {
              for (const row of scopeRows) {
                const gex = row?.vector?._meta?.gex;
                if (gex) {
                  row.exposures = {
                    spotPrice: gex.spotPrice,
                    netGamma: gex.netGamma, netDelta: gex.netDelta, netVega: gex.netVega,
                    netVanna: gex.netVanna, netCharm: gex.netCharm, netVomma: gex.netVomma,
                    callWall: gex.callWall, putWall: gex.putWall, gammaFlip: gex.gammaFlip,
                    regime: gex.regime,
                  };
                }
              }
            }
          }
        }
        if (include_symbols) return { _skipSizeGuard: true, data: res };
        if (res && typeof res === 'object' && 'market' in res) {
          return shapeMarketRegimeResponse({ market: res.market });
        }
        return res;
      }

      if (scope === 'intraday') {
        if (!symbol) throw new Error("scope='intraday' requires `symbol`");
        const intradayDays = days ?? 5;
        const params: Record<string, string> = { days: String(intradayDays) };
        if (date) params.date = date;
        if (interval) params.interval = interval;
        const res = await client.get(`/regime/intraday/${encodeURIComponent(symbol)}`, params);
        return { _skipSizeGuard: true, data: res };
      }

      // scope === 'symbol'
      if (!symbol) throw new Error("scope='symbol' requires `symbol`");
      const symbolDays = days ?? 1;
      if (symbolDays > 30) {
        throw new Error("scope='symbol' 'days' must be between 1 and 30");
      }
      const res = await client.get(`/regime/symbol/${encodeURIComponent(symbol.toUpperCase())}`, {
        days: String(symbolDays),
      }) as any;

      if (!res?.history?.length) return null;

      if (full) {
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

      for (const entry of res.history) {
        hoistExposures(entry);
      }

      if (symbolDays === 1) {
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
