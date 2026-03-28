import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { toolHandler } from '../helpers.js';
import { annotateRiskFreeRate } from './riskFreeRateShaping.js';

export function register(server: McpServer, client: ProxyClient): void {
  server.tool(
    'get_risk_free_rate',
    'Get the current Treasury benchmark currently served by the platform risk-free-rate endpoint for options pricing. The current endpoint returns a 10Y Treasury-based rate; use get_yield_curve if you need shorter maturities such as 1M or 3M.',
    {},
    toolHandler(async () => {
      const res = await client.get('/risk-free-rate') as any;
      return annotateRiskFreeRate(res);
    }),
  );
}
