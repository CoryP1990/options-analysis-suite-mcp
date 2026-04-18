import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';

/**
 * One unified tool for every options-market screener the platform
 * exposes through /scanner/*. Keeps the MCP tool count low while still
 * giving the AI access to all 16 screener families (+ market trends).
 * Sub-params (view / metric / side / mode / direction) are ignored
 * when not applicable to the chosen screener, and required when the
 * underlying endpoint mandates them.
 */

export const SCREENER_IDS = [
  // Main OptionsMarketPage tabs — support both ticker and contract views
  'most-active',
  'highest-oi',
  'highest-iv',
  'unusual',
  'gex',
  // Single-view leaderboards
  'model-divergence',
  'regime-stress',
  'term-backwardation',
  'put-skew',
  'delta-exposure',
  'vega-exposure',
  'pre-earnings-iv',
  // Screener families that need a sub-param to disambiguate
  'dod-change',            // metric: gex | iv | put-call | skew | regime
  'vrp',                   // side: high | low
  'max-pain',              // mode: pinning | divergence
  'unusual-directional',   // side: call | put
  // Market-wide summary, not a leaderboard
  'market-trends',
] as const;

const SCREENER_DESCRIPTION = `Run one of the 16 options-market screeners (plus a market-trends summary). Choose the screener via the \`screener\` enum; pass sub-params only for the screener that needs them:

• most-active / highest-oi / highest-iv / unusual / gex — main tabs. Use \`view\` (ticker|contract, default ticker). Support \`index\` (all|sp500|sp400|sp600|etf). \`unusual\` also accepts \`threshold\` (vol/OI ratio floor, default 1.0).
• dod-change — day-over-day leaderboards. Requires \`metric\` (gex|iv|put-call|skew|regime). Optional \`direction\` (up|down|all) for gex/iv/put-call.
• vrp — volatility risk premium. Requires \`side\` (high|low).
• max-pain — requires \`mode\` (pinning: spot near max pain + high gamma concentration; divergence: spot vs max pain in implied-move σ units).
• unusual-directional — requires \`side\` (call|put).
• market-trends — market-wide avg IV / volume / P/C time series. Optional \`days\` (default 90).
• Everything else takes only \`limit\`.

Returns the raw screener payload shape from the platform: \`{ data: Ticker[], currentDate, priorDate?, metric, ... }\`. Each ticker row includes the ranking metric plus supporting fields (spotPrice, totalOi, atmIv30d, label/stress, etc.). See the per-screener column notes at optionsanalysissuite.com/screeners.`;

type Sub = {
  view?: 'ticker' | 'contract';
  index?: 'all' | 'sp500' | 'sp400' | 'sp600' | 'etf';
  metric?: 'gex' | 'iv' | 'put-call' | 'skew' | 'regime';
  side?: 'high' | 'low' | 'call' | 'put';
  mode?: 'pinning' | 'divergence';
  direction?: 'all' | 'up' | 'down';
  threshold?: number;
  days?: number;
};

interface ScreenerRoute {
  path: string;
  query?: Record<string, string>;
}

function routeForScreener(screener: typeof SCREENER_IDS[number], sub: Sub, limit: number): ScreenerRoute {
  const limitStr = String(limit);

  switch (screener) {
    case 'most-active':
    case 'highest-oi':
    case 'highest-iv':
    case 'gex': {
      const endpoint = screener === 'most-active'
        ? '/scanner/most-active'
        : screener === 'highest-oi'
          ? '/scanner/high-oi'
          : screener === 'highest-iv'
            ? '/scanner/high-iv'
            : '/scanner/gex';
      return {
        path: endpoint,
        query: {
          limit: limitStr,
          type: sub.view ?? 'ticker',
          index: sub.index ?? 'all',
        },
      };
    }
    case 'unusual':
      return {
        path: '/scanner/unusual',
        query: {
          limit: limitStr,
          type: sub.view ?? 'ticker',
          index: sub.index ?? 'all',
          threshold: sub.threshold != null ? String(sub.threshold) : '1',
        },
      };
    case 'model-divergence':
      return { path: '/scanner/model-divergence', query: { limit: limitStr } };
    case 'term-backwardation':
      return { path: '/scanner/term-structure-backwardation', query: { limit: limitStr } };
    case 'delta-exposure':
      return { path: '/scanner/delta-exposure-leaders', query: { limit: limitStr } };
    case 'vega-exposure':
      return { path: '/scanner/vega-exposure-leaders', query: { limit: limitStr } };
    case 'pre-earnings-iv':
      return { path: '/scanner/pre-earnings-iv-expansion', query: { limit: limitStr } };
    case 'regime-stress': {
      // Dual-mode at the endpoint: mode=level (default) is the stress
      // leaderboard, mode=change is the biggest-regime-change feed.
      const mode = sub.metric === 'regime' ? 'change' : 'level';
      return { path: '/scanner/regime-stress', query: { limit: limitStr, mode } };
    }
    case 'put-skew': {
      // mode=level → put skew leaders; mode=change → biggest skew change.
      const mode = sub.metric === 'skew' ? 'change' : 'level';
      return { path: '/scanner/skew', query: { limit: limitStr, mode } };
    }
    case 'dod-change': {
      const metric = sub.metric;
      if (metric === 'skew') {
        return { path: '/scanner/skew', query: { limit: limitStr, mode: 'change' } };
      }
      if (metric === 'regime') {
        return { path: '/scanner/regime-stress', query: { limit: limitStr, mode: 'change' } };
      }
      if (metric !== 'gex' && metric !== 'iv' && metric !== 'put-call') {
        throw new Error("dod-change requires metric: 'gex' | 'iv' | 'put-call' | 'skew' | 'regime'");
      }
      const query: Record<string, string> = { limit: limitStr };
      if (sub.direction && sub.direction !== 'all') query.direction = sub.direction;
      return { path: `/scanner/changes/${metric}`, query };
    }
    case 'vrp': {
      if (sub.side !== 'high' && sub.side !== 'low') {
        throw new Error("vrp requires side: 'high' | 'low'");
      }
      return { path: '/scanner/vrp', query: { limit: limitStr, direction: sub.side } };
    }
    case 'max-pain': {
      if (sub.mode === 'pinning') {
        return { path: '/scanner/max-pain-pinning', query: { limit: limitStr } };
      }
      if (sub.mode === 'divergence') {
        return { path: '/scanner/max-pain-divergence', query: { limit: limitStr } };
      }
      throw new Error("max-pain requires mode: 'pinning' | 'divergence'");
    }
    case 'unusual-directional': {
      if (sub.side !== 'call' && sub.side !== 'put') {
        throw new Error("unusual-directional requires side: 'call' | 'put'");
      }
      return { path: '/scanner/unusual-directional', query: { limit: limitStr, side: sub.side } };
    }
    case 'market-trends': {
      const days = sub.days ?? 90;
      return { path: '/scanner/market-trends', query: { days: String(days) } };
    }
    default: {
      const exhaustive: never = screener;
      throw new Error(`Unknown screener: ${String(exhaustive)}`);
    }
  }
}

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'run_screener',
    SCREENER_DESCRIPTION,
    {
      screener: z.enum(SCREENER_IDS).describe('Which screener to run.'),
      limit: z.number().int().min(1).max(100).default(15).describe('Max rows (default 15, cap 100).'),
      view: z.enum(['ticker', 'contract']).optional().describe('Only for most-active/highest-oi/highest-iv/unusual/gex. Default ticker.'),
      index: z.enum(['all', 'sp500', 'sp400', 'sp600', 'etf']).optional().describe('Index bucket for main-tab screeners. Default all.'),
      metric: z.enum(['gex', 'iv', 'put-call', 'skew', 'regime']).optional().describe('Required for dod-change: which day-over-day metric to rank by.'),
      side: z.enum(['high', 'low', 'call', 'put']).optional().describe('Required for vrp (high|low) and unusual-directional (call|put).'),
      mode: z.enum(['pinning', 'divergence']).optional().describe('Required for max-pain.'),
      direction: z.enum(['all', 'up', 'down']).optional().describe('Optional direction filter for dod-change on gex/iv/put-call metrics.'),
      threshold: z.number().min(0).optional().describe('Only for unusual: min volume-to-open-interest ratio. Default 1.0.'),
      days: z.number().int().min(1).max(365).optional().describe('Only for market-trends: history length in days. Default 90.'),
    },
    toolHandler(async (args) => {
      const screener = args.screener as typeof SCREENER_IDS[number];
      const sub: Sub = {
        view: args.view as Sub['view'],
        index: args.index as Sub['index'],
        metric: args.metric as Sub['metric'],
        side: args.side as Sub['side'],
        mode: args.mode as Sub['mode'],
        direction: args.direction as Sub['direction'],
        threshold: args.threshold as number | undefined,
        days: args.days as number | undefined,
      };
      const limit = (args.limit as number) ?? 15;

      const route = routeForScreener(screener, sub, limit);
      const res = await client.get(route.path, route.query) as any;

      // Proxy responses standardize on { data: [...], ... }. If we
      // ever get an odd shape (e.g. /scanner/market-trends returns
      // sparklines keyed differently), we still pass it through
      // unmodified — the size guard in toolHandler handles trimming.
      return res;
    }),
  );
}
