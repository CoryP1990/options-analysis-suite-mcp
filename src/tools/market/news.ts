import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'get_news',
    'Get recent news headlines for a stock. Useful for understanding catalysts behind price or volatility moves, and for assessing event risk before entering an options position. Returns 10 most recent articles trimmed for token efficiency.',
    {
      symbol: z.string().describe('Ticker symbol'),
    },
    toolHandler(async ({ symbol }) => {
      const res = await client.get(`/stock-news/${encodeURIComponent(symbol.toUpperCase())}`) as any;
      // Cap to 10 news items and trim to essential fields
      // Backend fields: title, published_date, url, summary (not date/publishedDate/text/snippet)
      const items: unknown[] = Array.isArray(res) ? res : Array.isArray(res?.results) ? res.results : [];
      const trimmed = items.slice(0, 10).map((item: any) => ({
        title: item.title,
        date: item.published_date || item.date || item.publishedDate,
        url: item.url,
        summary: typeof item.summary === 'string' && item.summary.length > 200
          ? item.summary.slice(0, 200) + '...'
          : item.summary || item.text || item.snippet,
      }));
      if (Array.isArray(res)) return trimmed;
      if (res && typeof res === 'object') {
        res.results = trimmed;
        if (items.length > 10) res._results_note = `Showing 10 of ${items.length} articles.`;
        return res;
      }
      return trimmed;
    }),
  );
}
