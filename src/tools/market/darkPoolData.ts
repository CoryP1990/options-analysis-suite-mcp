import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';
import { AuthError, SubscriptionError } from '../../types.js';

type FetchResult = { kind: 'ok'; data: any } | { kind: 'missing' } | { kind: 'failed'; error: string };

/** Fetch with partial-failure support: rethrow auth/subscription errors, tag others */
async function safeGet(client: ProxyClient, path: string): Promise<FetchResult> {
  try {
    const data = await client.get(path);
    return data == null ? { kind: 'missing' } : { kind: 'ok', data };
  } catch (err: any) {
    if (err instanceof AuthError || err instanceof SubscriptionError) throw err;
    return { kind: 'failed', error: err.message };
  }
}

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'get_dark_pool_data',
    'Get FINRA OTC (dark pool) trading data and ATS (Alternative Trading System) statistics for a symbol. Shows off-exchange volume, dark pool participation rates, and which ATSes are most active. High dark pool activity can signal institutional accumulation or distribution.',
    {
      symbol: z.string().describe('Ticker symbol'),
    },
    toolHandler(async ({ symbol }) => {
      const sym = encodeURIComponent(symbol.toUpperCase());
      const [otcResult, atsResult] = await Promise.all([
        safeGet(client, `/finra/otc-trading/${sym}`),
        safeGet(client, `/finra/ats-data/${sym}`),
      ]);
      // Both missing = no data for this symbol; both failed = service error
      const bothMissing = otcResult.kind === 'missing' && atsResult.kind === 'missing';
      const bothFailed = otcResult.kind === 'failed' && atsResult.kind === 'failed';
      if (bothMissing) return null; // triggers "No data available" in toolHandler
      if (bothFailed) throw new Error('Both OTC and ATS data sources failed for this symbol');
      const result: Record<string, unknown> = {};
      if (otcResult.kind === 'ok') result.otcTrading = otcResult.data;
      else result._otc_note = otcResult.kind === 'failed' ? `OTC data unavailable: ${otcResult.error}` : 'No OTC data for this symbol';
      if (atsResult.kind === 'ok') result.atsData = atsResult.data;
      else result._ats_note = atsResult.kind === 'failed' ? `ATS data unavailable: ${atsResult.error}` : 'No ATS data for this symbol';
      return result;
    }),
  );
}
