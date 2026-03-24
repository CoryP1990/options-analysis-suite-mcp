/**
 * MCP Server Setup
 *
 * Creates the McpServer instance and registers all tools.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from './proxy/proxyClient.js';
import type { TokenManager } from './auth/tokenManager.js';
import { registerAllTools } from './tools/registry.js';

export function createMcpServer(
  proxyClient: ProxyClient,
  tokenManager: TokenManager,
): McpServer {
  const server = new McpServer({
    name: 'options-analysis-suite',
    version: '1.0.0',
  });

  registerAllTools(server, proxyClient, tokenManager);

  return server;
}
