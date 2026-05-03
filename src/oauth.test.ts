import { describe, expect, test } from 'bun:test';
import { handleAuthorizeGet } from './oauth.js';

// Cover the redirect-URI allowlist via the public route handler (no need to
// export the internal validator). handleAuthorizeGet returns a 400 with
// `Redirect URI not allowed` whenever isRedirectAllowed rejects, and a 200
// HTML login form when it accepts.
function authorize(redirectUri: string) {
  const q = new URLSearchParams();
  q.set('client_id', 'test');
  q.set('redirect_uri', redirectUri);
  q.set('state', 'xyz');
  q.set('code_challenge', 'a'.repeat(43));
  q.set('code_challenge_method', 'S256');
  return handleAuthorizeGet(q);
}

const isAllowed = (uri: string) => authorize(uri).status === 200;
const isRejected = (uri: string) => {
  const r = authorize(uri);
  return r.status === 400 && r.body.includes('Redirect URI not allowed');
};

describe('OAuth redirect URI allowlist', () => {
  test('accepts exact-allowlist entries', () => {
    expect(isAllowed('https://chatgpt.com/aip/oauth/callback')).toBe(true);
    expect(isAllowed('https://chat.openai.com/aip/oauth/callback')).toBe(true);
    expect(isAllowed('https://claude.ai/api/mcp/auth_callback')).toBe(true);
    expect(isAllowed('https://claude.com/api/mcp/auth_callback')).toBe(true);
    expect(isAllowed('http://localhost:6274/oauth/callback')).toBe(true);
    expect(isAllowed('http://localhost:6274/oauth/callback/debug')).toBe(true);
  });

  test('accepts ChatGPT/OpenAI variable-app callback paths', () => {
    expect(isAllowed('https://chatgpt.com/g-abc123/oauth/callback')).toBe(true);
    expect(isAllowed('https://chat.openai.com/g-abc123/oauth/callback')).toBe(true);
  });

  test('rejects arbitrary chatgpt.com paths (the original CVE)', () => {
    expect(isRejected('https://chatgpt.com/evil')).toBe(true);
    expect(isRejected('https://chatgpt.com/')).toBe(true);
    expect(isRejected('https://chat.openai.com/anything')).toBe(true);
  });

  test('rejects look-alike origins (chatgpt.com.evil.com)', () => {
    expect(isRejected('https://chatgpt.com.evil.com/aip/oauth/callback')).toBe(true);
    expect(isRejected('https://evil.com/chatgpt.com/aip/oauth/callback')).toBe(true);
    expect(isRejected('https://notchatgpt.com/aip/oauth/callback')).toBe(true);
  });

  test('rejects malformed URLs', () => {
    expect(isRejected('not-a-url')).toBe(true);
    expect(isRejected('javascript:alert(1)')).toBe(true);
    expect(isRejected('//chatgpt.com/aip/oauth/callback')).toBe(true);
  });
});
