import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'web_search',
    'Search the web for real-time financial information, news, and analysis. Use when you need current information not in the platform\'s database — breaking news, analyst opinions, macro developments. Requires the user to have configured a Brave Search API key.',
    {
      query: z.string().describe('Search query'),
      count: z.number().int().min(1).max(20).default(8).describe('Number of results'),
      freshness: z.enum(['pw', 'pm', 'py']).default('pw').describe('Recency: pw=past week, pm=past month, py=past year'),
    },
    async ({ query, count, freshness }) => {
      if (!client.hasSearchKey) {
        return {
          content: [{ type: 'text' as const, text: 'Web search is not available. The user has not configured a Brave Search API key. They can get a free key at api.search.brave.com and add it in the extension settings.' }],
          isError: true,
        };
      }
      try {
        const data = await client.get('/ai/search', { q: query, count: String(count), freshness });
        if (!data) return { content: [{ type: 'text' as const, text: 'No search results found.' }] };
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: `Search failed: ${err.message}` }], isError: true };
      }
    },
  );
}
