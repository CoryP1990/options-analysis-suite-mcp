import { describe, test, expect } from 'bun:test';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { register } from './snapshot.js';

type ToolHandler = (args: Record<string, unknown>) => Promise<{ isError?: boolean; content: Array<{ type: 'text'; text: string }> }>;

function createHarness(stubResponse: any = { data: [] }) {
  const calls: Array<{ path: string; params?: Record<string, string> }> = [];
  const fakeClient: ProxyClient = {
    get: async (path: string, params?: Record<string, string>) => {
      calls.push({ path, params });
      return stubResponse;
    },
    post: async () => ({}),
    hasSearchKey: false,
  } as unknown as ProxyClient;

  const captured: { handler: ToolHandler | null } = { handler: null };
  const fakeServer = {
    tool: (_name: string, _desc: string, _schema: unknown, handler: ToolHandler) => {
      captured.handler = handler;
    },
    registerTool: (_name: string, _config: unknown, handler: ToolHandler) => {
      captured.handler = handler;
    },
  } as unknown as McpServer;

  register(fakeServer, fakeClient);
  if (!captured.handler) throw new Error('Tool handler not captured');
  return { calls, handler: captured.handler };
}

describe('get_snapshot — GEX requires symbol', () => {
  test('type=gex without symbol throws', async () => {
    const { handler } = createHarness({ data: [] });
    const result = await handler({ type: 'gex' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("type='gex' requires `symbol`");
  });

  test('type=gex with symbol routes to /sync/analysis-data with type=gex + symbol', async () => {
    const { calls, handler } = createHarness({ data: [] });
    await handler({ type: 'gex', symbol: 'SPY', limit: 5 });
    expect(calls[0].path).toBe('/sync/analysis-data');
    expect(calls[0].params?.type).toBe('gex');
    expect(calls[0].params?.symbol).toBe('SPY');
    expect(calls[0].params?.limit).toBe('5');
  });
});

describe('get_snapshot — portfolio/risk fetchLimit behavior', () => {
  test('type=portfolio default mode fetches limit * 5 (capped at 50)', async () => {
    const { calls, handler } = createHarness({ data: [] });
    await handler({ type: 'portfolio', limit: 3 });
    expect(calls[0].params?.limit).toBe('15'); // 3 * 5
  });

  test('type=portfolio default mode caps at 50 when limit*5 exceeds', async () => {
    const { calls, handler } = createHarness({ data: [] });
    await handler({ type: 'portfolio', limit: 20 });
    expect(calls[0].params?.limit).toBe('50'); // min(100, 50)
  });

  test('type=portfolio full mode uses the requested limit directly', async () => {
    const { calls, handler } = createHarness({ data: [] });
    await handler({ type: 'portfolio', limit: 12, full: true });
    expect(calls[0].params?.limit).toBe('12');
  });

  test('type=risk default mode fetches limit * 5 (capped at 50)', async () => {
    const { calls, handler } = createHarness({ data: [] });
    await handler({ type: 'risk', limit: 4 });
    expect(calls[0].params?.limit).toBe('20');
  });

  test('type=risk full mode passes limit through', async () => {
    const { calls, handler } = createHarness({ data: [] });
    await handler({ type: 'risk', limit: 7, full: true });
    expect(calls[0].params?.limit).toBe('7');
  });
});

describe('get_snapshot — GEX details dual handling', () => {
  test('array-form details: collapsed to { _omitted: [\'expiration breakdowns (N items)\'] }', async () => {
    const stub = {
      data: [
        {
          id: 1,
          data: { gammaFlip: 495 },
          details: [{ exp: '2026-04-18' }, { exp: '2026-04-25' }, { exp: '2026-05-16' }],
        },
      ],
    };
    const { handler } = createHarness(stub);
    const result = await handler({ type: 'gex', symbol: 'SPY' });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.data[0].details._omitted).toEqual(['expiration breakdowns (3 items)']);
  });

  test('object-form details: scalars kept, array keys moved to _omitted', async () => {
    const stub = {
      data: [
        {
          id: 1,
          data: { gammaFlip: 495 },
          details: {
            netGEX: 1e9,
            spotPrice: 500,
            callWallLevels: [510, 520],
            putWallLevels: [490, 480],
          },
        },
      ],
    };
    const { handler } = createHarness(stub);
    const result = await handler({ type: 'gex', symbol: 'SPY' });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.data[0].details.netGEX).toBe(1e9);
    expect(parsed.data[0].details.spotPrice).toBe(500);
    expect(parsed.data[0].details.callWallLevels).toBeUndefined();
    expect(parsed.data[0].details.putWallLevels).toBeUndefined();
    expect(parsed.data[0].details._omitted).toEqual(['call wall levels (2 items)', 'put wall levels (2 items)']);
  });
});

describe('get_snapshot — full mode uses _skipSizeGuard', () => {
  test('type=gex full=true returns raw payload', async () => {
    const stub = { data: [{ id: 1 }, { id: 2 }], count: 2, meta: 'x' };
    const { handler } = createHarness(stub);
    const result = await handler({ type: 'gex', symbol: 'SPY', full: true });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toEqual(stub);
  });

  test('type=portfolio full=true returns raw payload', async () => {
    const stub = { data: [{ id: 1 }], count: 1 };
    const { handler } = createHarness(stub);
    const result = await handler({ type: 'portfolio', full: true });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toEqual(stub);
  });
});
