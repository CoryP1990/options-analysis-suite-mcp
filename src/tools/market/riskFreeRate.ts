import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'get_risk_free_rate',
    'Get the current Treasury-based risk-free rate used in options pricing models (Black-Scholes, binomial, etc.). Returns the annualized rate derived from short-term US Treasury yields.',
    {},
    toolHandler(async () => {
      return client.get('/risk-free-rate');
    }),
  );
}
