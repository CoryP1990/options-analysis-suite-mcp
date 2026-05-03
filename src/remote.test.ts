import { beforeAll, describe, expect, spyOn, test } from 'bun:test';
import type { parseRequestUrl as ParseRequestUrl } from './remote.js';

let parseRequestUrl: typeof ParseRequestUrl;

describe('parseRequestUrl', () => {
  const BASE = 'https://mcp.example.com';

  beforeAll(async () => {
    const originalTokenSecret = process.env.OAS_TOKEN_SECRET;
    delete process.env.OAS_TOKEN_SECRET;
    const warn = spyOn(console, 'warn').mockImplementation(() => {});
    try {
      ({ parseRequestUrl } = await import('./remote.js'));
      expect(warn).not.toHaveBeenCalled();
    } finally {
      if (originalTokenSecret === undefined) {
        delete process.env.OAS_TOKEN_SECRET;
      } else {
        process.env.OAS_TOKEN_SECRET = originalTokenSecret;
      }
      warn.mockRestore();
    }
  });

  test('parses a normal pathname against the base URL', () => {
    const url = parseRequestUrl('/health', BASE);
    expect(url).toBeInstanceOf(URL);
    expect(url?.pathname).toBe('/health');
    expect(url?.origin).toBe(BASE);
  });

  test('falls back to "/" when req.url is undefined', () => {
    const url = parseRequestUrl(undefined, BASE);
    expect(url?.pathname).toBe('/');
  });

  test('returns null and warns when the request target is malformed', () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const url = parseRequestUrl('http://[::1', BASE);
      expect(url).toBeNull();
      expect(warn).toHaveBeenCalledTimes(1);
      const [message, ctx] = warn.mock.calls[0] as [string, { url?: string; err?: string }];
      expect(message).toBe('[OAS MCP Remote] invalid request target');
      expect(ctx.url).toBe('http://[::1');
      expect(typeof ctx.err).toBe('string');
    } finally {
      warn.mockRestore();
    }
  });
});
