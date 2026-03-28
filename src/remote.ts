/**
 * Remote MCP Server Entry Point
 *
 * Runs as an HTTP service for Perplexity, ChatGPT, and other remote MCP clients.
 * Supports API key auth (base64 email:password) and OAuth 2.0 + PKCE (ChatGPT).
 */
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { TokenManager } from './auth/tokenManager.js';
import { ProxyClient } from './proxy/proxyClient.js';
import { createMcpServer } from './server.js';
import { AuthError, SubscriptionError } from './types.js';
import {
  resolveOAuthToken,
  handleProtectedResourceMetadata,
  handleAuthServerMetadata,
  handleAuthorizeGet,
  handleAuthorizePost,
  handleTokenExchange,
  handleClientRegistration,
} from './oauth.js';

const PROXY_URL = process.env.OAS_PROXY_URL || 'https://proxy.optionsanalysissuite.com';
const AUTH_SERVER_URL = process.env.OAS_AUTH_SERVER_URL || 'https://api.optionsanalysissuite.com';
const SEARCH_API_KEY = process.env.OAS_SEARCH_API_KEY;
const PUBLIC_BASE_URL = process.env.OAS_MCP_BASE_URL || 'https://mcp.optionsanalysissuite.com';
const PORT = parseInt(process.env.PORT || '8080', 10);

/** WWW-Authenticate challenge header for OAuth discovery */
function wwwAuthChallenge(error?: string): string {
  const resource = `${PUBLIC_BASE_URL}/.well-known/oauth-protected-resource`;
  let value = `Bearer resource_metadata="${resource}", scope="mcp"`;
  if (error) value += `, error="${error}"`;
  return value;
}

// --- Session & auth caching ---

interface Session {
  transport: StreamableHTTPServerTransport;
  apiKey: string;
  lastUsed: number;
}

interface AuthEntry {
  tokenManager: TokenManager;
  proxyClient: ProxyClient;
}

const sessions = new Map<string, Session>();
const authCache = new Map<string, AuthEntry>();

/** Decode base64(email:password) API key with strict validation */
function decodeApiKey(apiKey: string): { email: string; password: string } | null {
  try {
    const decoded = Buffer.from(apiKey, 'base64').toString('utf-8');
    // Strict round-trip: re-encode and compare to reject malformed base64
    if (Buffer.from(decoded).toString('base64') !== apiKey) return null;
    const colonIdx = decoded.indexOf(':');
    if (colonIdx === -1) return null;
    const email = decoded.substring(0, colonIdx);
    const password = decoded.substring(colonIdx + 1);
    if (!email || !password) return null;
    return { email, password };
  } catch {
    return null;
  }
}

/** Deduplicate concurrent auth initialization for the same API key */
const pendingAuth = new Map<string, Promise<AuthEntry>>();

/** Get or create an authenticated client for an API key */
async function getAuth(apiKey: string): Promise<AuthEntry> {
  const cached = authCache.get(apiKey);
  if (cached) return cached;

  // Return existing in-flight init if another request already started one
  const pending = pendingAuth.get(apiKey);
  if (pending) return pending;

  const promise = (async () => {
    const creds = decodeApiKey(apiKey);
    if (!creds) throw new AuthError('Invalid API key format. Expected base64(email:password).');

    const tokenManager = new TokenManager(AUTH_SERVER_URL, creds.email, creds.password);
    await tokenManager.initialize();

    const proxyClient = new ProxyClient(PROXY_URL, tokenManager, SEARCH_API_KEY);
    const entry: AuthEntry = { tokenManager, proxyClient };
    authCache.set(apiKey, entry);
    return entry;
  })();

  pendingAuth.set(apiKey, promise);
  promise.finally(() => pendingAuth.delete(apiKey)).catch(e => console.error('[OAS MCP] Auth init error:', e.message));
  return promise;
}

/** Extract API key from Authorization header (supports direct API key and OAuth Bearer tokens) */
function extractApiKey(headers: Record<string, string | string[] | undefined>): string | null {
  const auth = headers['authorization'] as string | undefined;
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice(7);
    // Check if this is an OAuth access token
    const oauthKey = resolveOAuthToken(token);
    if (oauthKey) return oauthKey;
    // Only fall back to direct API key if token decodes to valid email:password format
    const decoded = decodeApiKey(token);
    return decoded ? token : null;
  }
  if (auth?.startsWith('Api-Key ')) return auth.slice(8);
  const xKey = headers['x-api-key'] as string | undefined;
  if (xKey) return xKey;
  return null;
}

/** Read request body as string (capped at 1 MB to prevent memory exhaustion) */
function readBody(req: import('node:http').IncomingMessage, maxBytes = 1_048_576): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    let bytes = 0;
    let rejected = false;
    req.on('data', (chunk: Buffer) => {
      if (rejected) return;
      bytes += chunk.length;
      if (bytes > maxBytes) {
        rejected = true;
        reject(new Error('Request body too large'));
        return;
      }
      data += chunk;
    });
    req.on('end', () => { if (!rejected) resolve(data); });
    req.on('error', reject);
  });
}

/** Send JSON-RPC error response */
function jsonRpcError(res: import('node:http').ServerResponse, status: number, code: number, message: string): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null }));
}

/** Validate session ownership — reject if API key doesn't match */
function validateSessionOwnership(session: Session, apiKey: string, res: import('node:http').ServerResponse): boolean {
  if (session.apiKey !== apiKey) {
    jsonRpcError(res, 403, -32001, 'Forbidden: API key does not match session owner');
    return false;
  }
  return true;
}

// --- HTTP server ---

const server = createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, Mcp-Session-Id, Last-Event-Id');
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', sessions: sessions.size }));
    return;
  }

  // --- OAuth & .well-known routes ---

  if (req.url === '/.well-known/oauth-protected-resource') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(handleProtectedResourceMetadata(req.headers.host));
    return;
  }

  if (req.url === '/.well-known/oauth-authorization-server') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(handleAuthServerMetadata(req.headers.host));
    return;
  }

  if (req.url?.startsWith('/oauth/authorize')) {
    if (req.method === 'GET') {
      const url = new URL(req.url, `https://${req.headers.host}`);
      const result = handleAuthorizeGet(url.searchParams);
      res.writeHead(result.status, result.headers);
      res.end(result.body);
      return;
    }
    if (req.method === 'POST') {
      try {
        const body = await readBody(req);
        const result = await handleAuthorizePost(body);
        res.writeHead(result.status, result.headers);
        res.end(result.body);
      } catch {
        if (!res.headersSent) { res.writeHead(413); res.end('Request body too large'); }
      }
      return;
    }
  }

  if (req.url === '/oauth/token' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const result = handleTokenExchange(body);
      res.writeHead(result.status, result.headers);
      res.end(result.body);
    } catch {
      if (!res.headersSent) { res.writeHead(413); res.end('Request body too large'); }
    }
    return;
  }

  if (req.url === '/oauth/register' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const result = handleClientRegistration(body);
      res.writeHead(result.status, result.headers);
      res.end(result.body);
    } catch {
      if (!res.headersSent) { res.writeHead(413); res.end('Request body too large'); }
    }
    return;
  }

  // --- MCP endpoint ---

  if (req.url !== '/mcp') {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  // Auth — include WWW-Authenticate header for OAuth discovery (MCP spec requirement)
  const apiKey = extractApiKey(req.headers as Record<string, string | string[] | undefined>);
  if (!apiKey) {
    res.setHeader('WWW-Authenticate', wwwAuthChallenge());
    jsonRpcError(res, 401, -32001, 'Authentication required');
    return;
  }

  try {
    if (req.method === 'POST') {
      // Parse body — catch size and JSON errors separately
      let body: string;
      try {
        body = await readBody(req);
      } catch {
        if (!res.headersSent) jsonRpcError(res, 413, -32600, 'Request body too large');
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        jsonRpcError(res, 400, -32700, 'Parse error: invalid JSON');
        return;
      }

      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      if (sessionId && sessions.has(sessionId)) {
        // Existing session — verify ownership
        const session = sessions.get(sessionId)!;
        if (!validateSessionOwnership(session, apiKey, res)) return;
        session.lastUsed = Date.now();
        await session.transport.handleRequest(req, res, parsed);
      } else if (sessionId && !sessions.has(sessionId)) {
        // Invalid session ID → 404 per MCP spec
        jsonRpcError(res, 404, -32000, 'Session not found');
      } else if (!sessionId && isInitializeRequest(parsed)) {
        // New session — authenticate and create
        const { proxyClient, tokenManager } = await getAuth(apiKey);

        let transportRef: StreamableHTTPServerTransport;
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid: string) => {
            sessions.set(sid, { transport: transportRef, apiKey, lastUsed: Date.now() });
            console.log(`[OAS MCP] Session created: ${sid}`);
          },
        });
        transportRef = transport;

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid) {
            sessions.delete(sid);
            console.log(`[OAS MCP] Session closed: ${sid}`);
          }
        };

        const mcpServer = createMcpServer(proxyClient, tokenManager);
        await mcpServer.connect(transport);
        await transport.handleRequest(req, res, parsed);
      } else {
        // No session ID and not an init request → 400 per MCP spec
        jsonRpcError(res, 400, -32600, 'Bad Request: missing session ID or not an initialization request');
      }
    } else if (req.method === 'GET') {
      // SSE stream
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      if (!sessionId) {
        jsonRpcError(res, 400, -32000, 'Missing Mcp-Session-Id header');
        return;
      }
      if (!sessions.has(sessionId)) {
        jsonRpcError(res, 404, -32000, 'Session not found');
        return;
      }
      const session = sessions.get(sessionId)!;
      if (!validateSessionOwnership(session, apiKey, res)) return;
      session.lastUsed = Date.now();
      await session.transport.handleRequest(req, res);
    } else if (req.method === 'DELETE') {
      // Session termination
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      if (!sessionId) {
        jsonRpcError(res, 400, -32000, 'Missing Mcp-Session-Id header');
        return;
      }
      if (!sessions.has(sessionId)) {
        jsonRpcError(res, 404, -32000, 'Session not found');
        return;
      }
      const session = sessions.get(sessionId)!;
      if (!validateSessionOwnership(session, apiKey, res)) return;
      await session.transport.handleRequest(req, res);
    } else if (req.method === 'HEAD') {
      // HEAD /mcp — used by some clients for OAuth discovery probing
      res.setHeader('WWW-Authenticate', wwwAuthChallenge());
      res.writeHead(401);
      res.end();
    } else {
      res.writeHead(405);
      res.end('Method Not Allowed');
    }
  } catch (err: any) {
    console.error('[OAS MCP Remote] Error:', err.message);
    if (!res.headersSent) {
      if (err instanceof SubscriptionError) {
        jsonRpcError(res, 403, -32001, err.message);
      } else if (err instanceof AuthError) {
        res.setHeader('WWW-Authenticate', wwwAuthChallenge('invalid_token'));
        jsonRpcError(res, 401, -32001, err.message);
      } else {
        jsonRpcError(res, 500, -32603, err.message);
      }
    }
  }
});

// --- Cleanup idle sessions every 5 min ---

setInterval(() => {
  const now = Date.now();
  for (const [sid, session] of sessions) {
    if (now - session.lastUsed > 30 * 60 * 1000) {
      console.log(`[OAS MCP] Cleaning up idle session: ${sid}`);
      session.transport.close();
      sessions.delete(sid);
    }
  }
  // Clean up auth entries with no active sessions
  for (const [key] of authCache) {
    const hasSession = [...sessions.values()].some((s) => s.apiKey === key);
    if (!hasSession) {
      const entry = authCache.get(key);
      entry?.tokenManager.destroy();
      authCache.delete(key);
    }
  }
}, 5 * 60 * 1000);

// --- Graceful shutdown ---

process.on('SIGINT', async () => {
  console.log('[OAS MCP] Shutting down...');
  for (const [sid, session] of sessions) {
    await session.transport.close().catch(() => {});
    sessions.delete(sid);
  }
  for (const [, entry] of authCache) {
    entry.tokenManager.destroy();
  }
  authCache.clear();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('[OAS MCP] Shutting down...');
  for (const [sid, session] of sessions) {
    await session.transport.close().catch(() => {});
    sessions.delete(sid);
  }
  for (const [, entry] of authCache) {
    entry.tokenManager.destroy();
  }
  authCache.clear();
  process.exit(0);
});

// --- Start ---

// Warn if OAuth token encryption is not configured (ChatGPT OAuth will fail)
if (!process.env.OAS_TOKEN_SECRET) {
  console.warn('[OAS MCP Remote] WARNING: OAS_TOKEN_SECRET is not set. OAuth/ChatGPT integration will not work. API key auth (Perplexity) is unaffected.');
}

server.listen(PORT, () => {
  console.log(`[OAS MCP Remote] Streamable HTTP server listening on port ${PORT}`);
  console.log(`[OAS MCP Remote] Proxy: ${PROXY_URL}`);
  console.log(`[OAS MCP Remote] Auth: ${AUTH_SERVER_URL}`);
});
