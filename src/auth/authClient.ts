/**
 * Auth Client
 *
 * HTTP calls to the auth server for login, token refresh, and profile.
 * Credentials are never logged or exposed in error messages.
 */
import type { AuthTokens, UserProfile } from '../types.js';
import { AuthError } from '../types.js';

/** Decode base64url (JWT standard) to string. Normalizes URL-safe chars for atob. */
function decodeBase64Url(str: string): string {
  // Replace URL-safe chars with standard base64, add padding
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
  return atob(padded);
}

/** Extract expiry from JWT without verification (server already validated). */
function getJwtExpiry(token: string): number {
  try {
    const payload = JSON.parse(decodeBase64Url(token.split('.')[1]));
    return (payload.exp ?? 0) * 1000;
  } catch {
    return Date.now() + 15 * 60 * 1000; // fallback: 15 min from now
  }
}

/**
 * Login with email/password → get access + refresh tokens.
 */
export async function login(
  authServerUrl: string,
  email: string,
  password: string,
): Promise<AuthTokens> {
  const response = await fetch(`${authServerUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const status = response.status;
    if (status === 401 || status === 403) {
      throw new AuthError('Invalid email or password. Please check your credentials in the extension settings.');
    }
    throw new AuthError(`Login failed (HTTP ${status}). Please try again later.`);
  }

  const json = await response.json() as any;
  const accessToken = json.token || json.accessToken;
  const refreshToken = json.refreshToken;

  if (!accessToken) {
    throw new AuthError('Login succeeded but no token returned. Please contact support.');
  }

  const expiresAt = getJwtExpiry(accessToken);

  return { accessToken, refreshToken, expiresAt };
}

/**
 * Refresh access token using refresh token (sent in body, not cookie).
 */
export async function refreshAccessToken(
  authServerUrl: string,
  refreshToken: string,
): Promise<AuthTokens> {
  const response = await fetch(`${authServerUrl}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) {
    throw new AuthError('Session expired. Please restart the MCP extension to re-authenticate.');
  }

  const json = await response.json() as any;
  const accessToken = json.token || json.accessToken;
  const newRefreshToken = json.refreshToken || refreshToken;

  if (!accessToken) {
    throw new AuthError('Token refresh succeeded but no token returned.');
  }

  const expiresAt = getJwtExpiry(accessToken);

  return { accessToken, refreshToken: newRefreshToken, expiresAt };
}

/**
 * Get user profile including subscription status.
 */
export async function getProfile(
  authServerUrl: string,
  accessToken: string,
): Promise<UserProfile> {
  const response = await fetch(`${authServerUrl}/api/v1/user/profile`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new AuthError('Token expired or invalid.');
    }
    throw new AuthError(`Failed to fetch profile (HTTP ${response.status}).`);
  }

  return response.json() as Promise<UserProfile>;
}
