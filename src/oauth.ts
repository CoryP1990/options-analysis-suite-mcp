/**
 * OAuth 2.0 Authorization Code + PKCE for ChatGPT MCP integration.
 *
 * Flow:
 * 1. ChatGPT redirects user to GET /oauth/authorize
 * 2. User enters OAS credentials on our login page
 * 3. We validate credentials, generate auth code, redirect back to ChatGPT
 * 4. ChatGPT calls POST /oauth/token with code + code_verifier
 * 5. We return a self-contained encrypted access token
 * 6. ChatGPT sends Bearer <token> on MCP requests
 *
 * OAuth tokens are stateless — the API key and expiry are encrypted into the
 * token itself using AES-256-GCM with OAS_TOKEN_SECRET. This means tokens
 * survive server restarts and deploys without requiring persistent storage.
 */
import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { login, getProfile } from './auth/authClient.js';
import { AuthError } from './types.js';

const AUTH_SERVER_URL = process.env.OAS_AUTH_SERVER_URL || 'https://api.optionsanalysissuite.com';

// Derive a 32-byte AES key from the token secret
const TOKEN_SECRET = process.env.OAS_TOKEN_SECRET || '';
const tokenKey = TOKEN_SECRET
  ? createHash('sha256').update(TOKEN_SECRET).digest()
  : null;

// Allowed redirect URIs — exact origin+path
const ALLOWED_REDIRECTS = [
  // ChatGPT/OpenAI callback endpoints
  'https://chatgpt.com/aip/oauth/callback',
  'https://chat.openai.com/aip/oauth/callback',
  // Claude Web (exact documented callback paths)
  'https://claude.ai/api/mcp/auth_callback',
  'https://claude.com/api/mcp/auth_callback',
  // Claude Code / local development
  'http://localhost:6274/oauth/callback',
  'http://localhost:6274/oauth/callback/debug',
];

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// --- Encrypted token helpers ---

/** Encrypt an API key + expiry into a self-contained access token */
function encryptToken(apiKey: string, expiresAt: number): string {
  if (!tokenKey) throw new Error('OAS_TOKEN_SECRET is not configured');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', tokenKey, iv);
  const payload = JSON.stringify({ k: apiKey, e: expiresAt });
  const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: base64url(iv + ciphertext + authTag)
  return Buffer.concat([iv, encrypted, tag]).toString('base64url');
}

/** Decrypt an access token back to an API key, or null if invalid/expired */
function decryptToken(token: string): string | null {
  if (!tokenKey) return null;
  try {
    const buf = Buffer.from(token, 'base64url');
    if (buf.length < 29) return null; // 12 iv + 1 min ciphertext + 16 tag
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(buf.length - 16);
    const encrypted = buf.subarray(12, buf.length - 16);
    const decipher = createDecipheriv('aes-256-gcm', tokenKey, iv);
    decipher.setAuthTag(tag);
    const decrypted = decipher.update(encrypted) + decipher.final('utf8');
    const { k, e } = JSON.parse(decrypted);
    if (Date.now() > e) return null;
    return k;
  } catch {
    return null;
  }
}

// --- In-memory stores (auth codes only — tokens are stateless) ---

interface AuthCode {
  apiKey: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  redirectUri: string;
  clientId: string;
  state: string;
  expiresAt: number;
}

const authCodes = new Map<string, AuthCode>();

// Cleanup expired auth codes every 60s
setInterval(() => {
  const now = Date.now();
  for (const [code, data] of authCodes) {
    if (now > data.expiresAt) authCodes.delete(code);
  }
}, 60_000);

/** Resolve an OAuth Bearer token to an API key (base64 email:password) */
export function resolveOAuthToken(token: string): string | null {
  return decryptToken(token);
}

/** Validate redirect URI against allowlist using parsed URL comparison */
function isRedirectAllowed(uri: string): boolean {
  try {
    const parsed = new URL(uri);
    const normalized = `${parsed.origin}${parsed.pathname}`;

    // ChatGPT/OpenAI allow variable app IDs but require the OAuth callback suffix.
    if ((parsed.origin === 'https://chatgpt.com' || parsed.origin === 'https://chat.openai.com')
      && parsed.pathname.endsWith('/oauth/callback')) {
      return true;
    }

    return ALLOWED_REDIRECTS.some((allowed) => normalized === allowed);
  } catch {
    return false;
  }
}

/** Get the server's base URL — prefer configured env var over request host */
function getBaseUrl(host: string | undefined): string {
  const configured = process.env.OAS_MCP_BASE_URL;
  if (configured) return configured;
  const h = host || 'mcp.optionsanalysissuite.com';
  return `https://${h}`;
}

// --- Route handlers ---

/** GET /.well-known/oauth-protected-resource */
export function handleProtectedResourceMetadata(host: string | undefined): string {
  const base = getBaseUrl(host);
  return JSON.stringify({
    resource: base,
    authorization_servers: [base],
    scopes_supported: ['mcp'],
  });
}

/** GET /.well-known/oauth-authorization-server */
export function handleAuthServerMetadata(host: string | undefined): string {
  const base = getBaseUrl(host);
  return JSON.stringify({
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: ['mcp'],
  });
}

/** GET /oauth/authorize — render login page */
export function handleAuthorizeGet(query: URLSearchParams): { status: number; headers: Record<string, string>; body: string } {
  const clientId = query.get('client_id') || '';
  const redirectUri = query.get('redirect_uri') || '';
  const state = query.get('state') || '';
  const codeChallenge = query.get('code_challenge') || '';
  const codeChallengeMethod = query.get('code_challenge_method') || 'S256';
  const scope = query.get('scope') || '';

  // Validate redirect URI before showing login form
  if (redirectUri && !isRedirectAllowed(redirectUri)) {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'invalid_request', error_description: 'Redirect URI not allowed' }),
    };
  }

  // Reject non-S256 PKCE before showing login form
  if (codeChallengeMethod !== 'S256') {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'invalid_request', error_description: 'Only S256 code_challenge_method is supported' }),
    };
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Options Analysis Suite — Sign In</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
    .card { background: #1e293b; border-radius: 12px; padding: 40px; max-width: 400px; width: 100%; box-shadow: 0 4px 24px rgba(0,0,0,0.3); }
    h1 { font-size: 1.4rem; margin-bottom: 8px; color: #f8fafc; }
    .subtitle { font-size: 0.85rem; color: #94a3b8; margin-bottom: 24px; }
    label { display: block; font-size: 0.85rem; color: #94a3b8; margin-bottom: 4px; }
    input[type="email"], input[type="password"] { width: 100%; padding: 10px 12px; border-radius: 6px; border: 1px solid #334155; background: #0f172a; color: #e2e8f0; font-size: 0.95rem; margin-bottom: 16px; }
    input:focus { outline: none; border-color: #0d9488; }
    button { width: 100%; padding: 12px; border-radius: 6px; border: none; background: #0d9488; color: #fff; font-size: 1rem; font-weight: 600; cursor: pointer; }
    button:hover { background: #0f766e; }
    .error { background: #7f1d1d; color: #fca5a5; padding: 10px; border-radius: 6px; margin-bottom: 16px; font-size: 0.85rem; }
    .logo { font-size: 1.8rem; margin-bottom: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">&#10022;</div>
    <h1>Options Analysis Suite</h1>
    <p class="subtitle">Sign in to connect your account to ChatGPT</p>
    <form method="POST" action="/oauth/authorize">
      <input type="hidden" name="client_id" value="${escapeHtml(clientId)}">
      <input type="hidden" name="redirect_uri" value="${escapeHtml(redirectUri)}">
      <input type="hidden" name="state" value="${escapeHtml(state)}">
      <input type="hidden" name="code_challenge" value="${escapeHtml(codeChallenge)}">
      <input type="hidden" name="code_challenge_method" value="${escapeHtml(codeChallengeMethod)}">
      <input type="hidden" name="scope" value="${escapeHtml(scope)}">
      <label for="email">Email</label>
      <input type="email" id="email" name="email" required placeholder="you@example.com">
      <label for="password">Password</label>
      <input type="password" id="password" name="password" required placeholder="Your password">
      <button type="submit">Sign In & Authorize</button>
    </form>
  </div>
</body>
</html>`;

  return { status: 200, headers: { 'Content-Type': 'text/html' }, body: html };
}

/** POST /oauth/authorize — validate credentials, issue code, redirect */
export async function handleAuthorizePost(body: string): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  const params = new URLSearchParams(body);
  const email = params.get('email') || '';
  const password = params.get('password') || '';
  const clientId = params.get('client_id') || '';
  const redirectUri = params.get('redirect_uri') || '';
  const state = params.get('state') || '';
  const codeChallenge = params.get('code_challenge') || '';
  const codeChallengeMethod = params.get('code_challenge_method') || 'S256';

  // Validate redirect URI
  if (!isRedirectAllowed(redirectUri)) {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'invalid_request', error_description: 'Redirect URI not allowed' }),
    };
  }

  // PKCE is required — reject requests without a code challenge
  if (!codeChallenge) {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'invalid_request', error_description: 'PKCE code_challenge is required' }),
    };
  }

  // Only S256 is supported — reject early before credential validation
  if (codeChallengeMethod !== 'S256') {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'invalid_request', error_description: 'Only S256 code_challenge_method is supported' }),
    };
  }

  // Validate credentials and subscription
  let errorMsg = '';
  try {
    const tokens = await login(AUTH_SERVER_URL, email, password);
    // Check subscription status
    const profile = await getProfile(AUTH_SERVER_URL, tokens.accessToken);
    const sub = profile.subscription;
    const isActive = profile.user.isDeveloper
      || profile.user.bypassSubscription
      || (sub && (sub.status === 'active' || sub.status === 'trialing'));
    if (!isActive) {
      errorMsg = 'Your subscription is not active. Please visit optionsanalysissuite.com/pricing to subscribe.';
    }
  } catch (err) {
    // AuthError with "Invalid email" is a credential failure (401/403);
    // all other errors (timeouts, 5xx, JSON parse) are service issues
    const isCredentialError = err instanceof AuthError
      && /invalid email/i.test(err.message);
    errorMsg = isCredentialError
      ? 'Invalid email or password. Please try again.'
      : 'Login service unavailable. Please try again later.';
  }

  if (errorMsg) {
    // Return login page with error
    const errorHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Options Analysis Suite — Sign In</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
    .card { background: #1e293b; border-radius: 12px; padding: 40px; max-width: 400px; width: 100%; box-shadow: 0 4px 24px rgba(0,0,0,0.3); }
    h1 { font-size: 1.4rem; margin-bottom: 8px; color: #f8fafc; }
    .subtitle { font-size: 0.85rem; color: #94a3b8; margin-bottom: 24px; }
    label { display: block; font-size: 0.85rem; color: #94a3b8; margin-bottom: 4px; }
    input[type="email"], input[type="password"] { width: 100%; padding: 10px 12px; border-radius: 6px; border: 1px solid #334155; background: #0f172a; color: #e2e8f0; font-size: 0.95rem; margin-bottom: 16px; }
    input:focus { outline: none; border-color: #0d9488; }
    button { width: 100%; padding: 12px; border-radius: 6px; border: none; background: #0d9488; color: #fff; font-size: 1rem; font-weight: 600; cursor: pointer; }
    button:hover { background: #0f766e; }
    .error { background: #7f1d1d; color: #fca5a5; padding: 10px; border-radius: 6px; margin-bottom: 16px; font-size: 0.85rem; }
    .logo { font-size: 1.8rem; margin-bottom: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">&#10022;</div>
    <h1>Options Analysis Suite</h1>
    <p class="subtitle">Sign in to connect your account to ChatGPT</p>
    <div class="error">${escapeHtml(errorMsg)}</div>
    <form method="POST" action="/oauth/authorize">
      <input type="hidden" name="client_id" value="${escapeHtml(clientId)}">
      <input type="hidden" name="redirect_uri" value="${escapeHtml(redirectUri)}">
      <input type="hidden" name="state" value="${escapeHtml(state)}">
      <input type="hidden" name="code_challenge" value="${escapeHtml(codeChallenge)}">
      <input type="hidden" name="code_challenge_method" value="${escapeHtml(codeChallengeMethod)}">
      <label for="email">Email</label>
      <input type="email" id="email" name="email" required placeholder="you@example.com" value="${escapeHtml(email)}">
      <label for="password">Password</label>
      <input type="password" id="password" name="password" required placeholder="Your password">
      <button type="submit">Sign In & Authorize</button>
    </form>
  </div>
</body>
</html>`;
    return { status: 200, headers: { 'Content-Type': 'text/html' }, body: errorHtml };
  }

  // Generate auth code — store derived apiKey, not raw credentials
  const code = randomBytes(32).toString('hex');
  const apiKey = Buffer.from(`${email}:${password}`).toString('base64');
  authCodes.set(code, {
    apiKey,
    codeChallenge,
    codeChallengeMethod,
    redirectUri,
    clientId,
    state,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 min
  });

  // Redirect back to ChatGPT
  const redirectUrl = new URL(redirectUri);
  redirectUrl.searchParams.set('code', code);
  if (state) redirectUrl.searchParams.set('state', state);

  return {
    status: 302,
    headers: { Location: redirectUrl.toString() },
    body: '',
  };
}

/** POST /oauth/token — exchange code for access token */
export function handleTokenExchange(body: string): { status: number; headers: Record<string, string>; body: string } {
  const params = new URLSearchParams(body);
  const grantType = params.get('grant_type');
  const code = params.get('code') || '';
  const codeVerifier = params.get('code_verifier') || '';
  const redirectUri = params.get('redirect_uri') || '';
  const clientId = params.get('client_id') || '';

  if (grantType !== 'authorization_code') {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'unsupported_grant_type' }),
    };
  }

  const authCode = authCodes.get(code);
  if (!authCode || Date.now() > authCode.expiresAt) {
    authCodes.delete(code);
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'invalid_grant', error_description: 'Code expired or invalid' }),
    };
  }

  // Verify client_id matches the original authorization request
  if (clientId !== authCode.clientId) {
    authCodes.delete(code);
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'invalid_grant', error_description: 'Client ID mismatch' }),
    };
  }

  // Verify PKCE — S256 only (code_challenge enforced at authorize time)
  if (authCode.codeChallengeMethod !== 'S256') {
    authCodes.delete(code);
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'invalid_grant', error_description: 'Only S256 code_challenge_method is supported' }),
    };
  }
  const computedChallenge = createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
  if (computedChallenge !== authCode.codeChallenge) {
    authCodes.delete(code);
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'invalid_grant', error_description: 'PKCE verification failed' }),
    };
  }

  // Verify redirect_uri matches the original authorization request (RFC 6749 Section 4.1.3)
  if (authCode.redirectUri && redirectUri !== authCode.redirectUri) {
    authCodes.delete(code);
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'invalid_grant', error_description: 'Redirect URI mismatch' }),
    };
  }

  // Consume the code
  authCodes.delete(code);

  // Generate self-contained encrypted access token (survives server restarts)
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  let accessToken: string;
  try {
    accessToken = encryptToken(authCode.apiKey, expiresAt);
  } catch {
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'server_error', error_description: 'Token encryption not configured' }),
    };
  }

  return {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify({
      access_token: accessToken,
      token_type: 'bearer',
      expires_in: 86400, // 24 hours
      scope: 'mcp',
    }),
  };
}

/** POST /oauth/register — Dynamic Client Registration (RFC 7591) */
export function handleClientRegistration(body: string): { status: number; headers: Record<string, string>; body: string } {
  try {
    const req = JSON.parse(body);

    // Per RFC 7591, the server filters requested metadata to what it supports
    // and returns the actual values in the response. Rejecting clients that ask
    // for refresh_token alongside authorization_code (as ChatGPT does) breaks
    // DCR for those clients with no benefit.
    if (req.grant_types !== undefined) {
      if (!Array.isArray(req.grant_types)) {
        return { status: 400, headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'invalid_client_metadata', error_description: 'grant_types must be an array' }) };
      }
      if (!req.grant_types.includes('authorization_code')) {
        return { status: 400, headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'invalid_client_metadata', error_description: 'authorization_code grant type must be requested' }) };
      }
    }
    if (req.response_types !== undefined) {
      if (!Array.isArray(req.response_types)) {
        return { status: 400, headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'invalid_client_metadata', error_description: 'response_types must be an array' }) };
      }
      if (!req.response_types.includes('code')) {
        return { status: 400, headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'invalid_client_metadata', error_description: 'code response type must be requested' }) };
      }
    }
    if (req.token_endpoint_auth_method && req.token_endpoint_auth_method !== 'none') {
      return { status: 400, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'invalid_client_metadata', error_description: 'Only none token_endpoint_auth_method is supported' }) };
    }
    // Validate redirect_uris are HTTPS (or localhost for dev)
    if (req.redirect_uris !== undefined) {
      if (!Array.isArray(req.redirect_uris)) {
        return { status: 400, headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'invalid_redirect_uri', error_description: 'redirect_uris must be an array' }) };
      }
      for (const uri of req.redirect_uris) {
        try {
          const parsed = new URL(uri);
          if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
            return { status: 400, headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ error: 'invalid_redirect_uri', error_description: 'Redirect URIs must use HTTPS' }) };
          }
        } catch {
          return { status: 400, headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'invalid_redirect_uri', error_description: 'Invalid redirect URI format' }) };
        }
      }
    }

    // Always generate client_id server-side (don't let caller choose)
    const clientId = `oas_${randomBytes(16).toString('hex')}`;
    return {
      status: 201,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Pragma': 'no-cache' },
      body: JSON.stringify({
        client_id: clientId,
        client_id_issued_at: Math.floor(Date.now() / 1000),
        client_name: req.client_name || 'MCP Client',
        redirect_uris: req.redirect_uris || [],
        grant_types: ['authorization_code'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        scope: 'mcp',
      }),
    };
  } catch {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'invalid_client_metadata' }),
    };
  }
}

/** Escape HTML to prevent XSS in login form */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
