import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.registerTool(
    'web_search',
    {
      title: 'Web Search',
      description: 'Search the web for real-time financial information, news, and analysis. Use when you need current information not in the platform\'s database — breaking news, analyst opinions, macro developments. Requires the user to have configured a Brave Search API key.',
      inputSchema: {
        query: z.string().describe('Search query'),
        count: z.number().int().min(1).max(20).default(8).describe('Number of results'),
        freshness: z.enum(['pw', 'pm', 'py']).default('pw').describe('Recency: pw=past week, pm=past month, py=past year'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ query, count, freshness }) => {
      if (!client.hasSearchKey) {
        return {
          content: [{ type: 'text' as const, text: 'Web search is not available. The user has not configured a Brave Search API key. They can get a free key at api.search.brave.com and add it in the extension settings.' }],
          isError: true,
        };
      }
      // Use toolHandler for error handling and size guard
      return toolHandler(async () => {
        const data = await client.get('/ai/search', { q: query, count: String(count), freshness }) as any;
        if (!data) return null;
        // Trim to essential fields for token efficiency
        const results = (data.web?.results || data.results || []).map((r: any) => ({
          title: r.title,
          url: r.url,
          description: r.description || r.snippet,
          age: r.age || r.published_date,
        }));
        return { query, results };
      })({} as any);
    },
  );
}
