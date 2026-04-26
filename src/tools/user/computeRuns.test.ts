import { describe, expect, test } from 'bun:test';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProxyClient } from '../../proxy/proxyClient.js';
import { register } from './computeRuns.js';

type ToolHandler = (args: Record<string, unknown>) => Promise<{ isError?: boolean; content: Array<{ type: 'text'; text: string }> }>;

function createHarness(stubResponse: any) {
  const calls: Array<{ path: string; params?: Record<string, string> }> = [];
  const fakeClient: ProxyClient = {
    get: async (path: string, params?: Record<string, string>) => {
      calls.push({ path, params });
      return structuredClone(stubResponse);
    },
    post: async () => ({}),
    hasSearchKey: false,
  } as unknown as ProxyClient;

  const captured: { handler: ToolHandler | null } = { handler: null };
  const fakeServer = {
    registerTool: (_name: string, _config: unknown, handler: ToolHandler) => {
      captured.handler = handler;
    },
  } as unknown as McpServer;

  register(fakeServer, fakeClient);
  if (!captured.handler) throw new Error('Tool handler not captured');
  return { calls, handler: captured.handler };
}

function makeRun(index = 0) {
  const models = Object.fromEntries(
    Array.from({ length: 7 }, (_, modelIndex) => [
      `Model${modelIndex + 1}`,
      {
        representative: {
          price: 1 + modelIndex,
          greeks: { Delta: 0.5, Gamma: 0.01 },
          dimensions: { exerciseStyle: 'european' },
        },
        calibration: {
          rmse: 0.01,
          confidence: 0.9,
          isFallback: modelIndex === 0,
          fallbackReason: 'insufficient_surface',
          executionPath: 'worker',
          economicPenalty: 1.25,
          seedRejections: [{ reason: 'bad_seed' }],
        },
      },
    ]),
  );

  return {
    id: 100 + index,
    user_id: 1,
    created_at: '2026-04-01T00:00:00.000Z',
    run_key: `run-${index}`,
    runKey: `run-${index}`,
    latestRunKey: `run-${index}`,
    scope: 'core',
    quality: 'balanced',
    status: 'completed',
    timestamp: 1774771200000 - index * 1000,
    data: {
      summary: { totalPositions: 4, totalModelRuns: 28, completedAt: 1774771500000 },
      portfolioAggregates: {
        dispersion: { Delta: { min: 0.4, max: 0.6, mean: 0.5, stddev: 0.1, models: ['Model1'] } },
        excluded: { byReason: { missing_iv: 2 } },
      },
      exposureSweep: [{ underlying: 'SPY', keyLevels: { callWall: 650, gammaFlip: 645.5 } }],
    },
    positions: Array.from({ length: 4 }, (_, positionIndex) => ({
      positionId: `pos-${index}-${positionIndex}`,
      symbol: `SPY C${positionIndex}`,
      underlying: 'SPY',
      isCall: true,
      strike: 650 + positionIndex,
      expiration: '2026-05-15',
      marketPrice: 10 + positionIndex,
      quantity: 1,
      multiplier: 100,
      models,
    })),
  };
}

describe('get_compute_runs wire output', () => {
  test('default view removes run identifiers and uses readable omission fields', async () => {
    const { handler } = createHarness({ data: [makeRun(0), makeRun(1)], count: 2 });
    const result = await handler({ limit: 2 });
    const parsed = JSON.parse(result.content[0].text);
    const text = result.content[0].text;

    expect(parsed.data).toHaveLength(2);
    expect(parsed.data[0].positionsNotShown).toBe(2);
    expect(parsed.data[0].positions[0].models).toBeUndefined();
    expect(parsed.data[0].positions[0].modelsNotShown).toBeUndefined();
    expect(parsed.data[0].positions[0].modelSummary.modelCount).toBe(7);
    expect(parsed.data[0].positions[0].modelSummary.modelsPreview).toEqual(['Model2', 'Model3', 'Model4']);
    expect(text).not.toContain('runKey');
    expect(text).not.toContain('latestRunKey');
    expect(text).not.toContain('run_key');
    expect(text).not.toContain('omittedModelCount');
    expect(text).not.toContain('omittedPositionCount');
    expect(text).not.toContain('positionId');
    expect(text).not.toContain('portfolioSnapshotId');
    expect(text).not.toContain('riskSnapshotId');
  });

  test('full view strips raw backend identifiers and calibration plumbing', async () => {
    const { handler } = createHarness({ data: [makeRun(0)], count: 1 });
    const result = await handler({ limit: 1, full: true });
    const parsed = JSON.parse(result.content[0].text);
    const text = result.content[0].text;

    expect(parsed.data[0].status).toBe('completed');
    expect(text).toContain('fallback (default parameters)');
    expect(text).toContain('insufficient surface');
    expect(text).not.toContain('runKey');
    expect(text).not.toContain('latestRunKey');
    expect(text).not.toContain('run_key');
    expect(text).not.toContain('user_id');
    expect(text).not.toContain('created_at');
    expect(text).not.toContain('positionId');
    expect(text).not.toContain('executionPath');
    expect(text).not.toContain('economicPenalty');
    expect(text).not.toContain('seedRejections');
    expect(text).not.toContain('portfolioAggregates');
    expect(text).not.toContain('byReason');
    expect(text).not.toContain('fallbackReason');
  });

  test('humanizes model identifiers and strips calibration seeds on the wire', async () => {
    const run: any = makeRun(0);
    run.data.portfolioAggregates.dispersion.Price = {
      min: 1,
      max: 3,
      mean: 2,
      stddev: 0.5,
      models: ['BlackScholes', 'JumpDiffusion', 'VarianceGamma'],
    };
    run.positions[0].models = {
      BlackScholes: {
        representative: { price: 1, greeks: { Delta: 0.5 } },
        calibration: { isFallback: false, params: { seed: 12345, sigma: 0.22 } },
      },
      JumpDiffusion: {
        representative: { price: 2, greeks: { Delta: 0.51 } },
        calibration: { isFallback: false, params: { seed: 67890, lambda: 0.1 } },
      },
      VarianceGamma: {
        representative: { price: 3, greeks: { Delta: 0.52 } },
        calibration: { isFallback: false, params: { seed: 24680, theta: 0.2 } },
      },
    };

    const { handler } = createHarness({ data: [run], count: 1 });
    const result = await handler({ limit: 1 });
    const text = result.content[0].text;
    const parsed = JSON.parse(text);

    expect(parsed.data[0].portfolioDispersion.Price.models).toEqual(['Black-Scholes', 'Jump Diffusion', 'Variance Gamma']);
    const targetPosition = parsed.data[0].positions.find((position: any) => position.symbol === 'SPY C0');
    expect(targetPosition.models['Black-Scholes']).toBeDefined();
    expect(targetPosition.models['Jump Diffusion']).toBeDefined();
    expect(targetPosition.models['Variance Gamma']).toBeDefined();
    expect(text).not.toContain('BlackScholes');
    expect(text).not.toContain('JumpDiffusion');
    expect(text).not.toContain('VarianceGamma');
    expect(text).not.toContain('"seed"');
  });
});
