import { describe, expect, test } from 'bun:test';
import { recordMatchesComputeFilters, sanitizeComputeRunsWireOutput, shapeComputeRunRecord, summarizeComputeRunsResponse } from './computeRunsShaping.js';

function makeRecord() {
  return {
    id: 9,
    user_id: 1,
    created_at: '2026-03-29T08:00:00.000Z',
    run_key: 'run-123',
    scope: 'full',
    quality: 'balanced',
    status: 'completed',
    timestamp: 1774771200000,
    data: {
      summary: {
        completedAt: 1774771560000,
        totalPositions: 2,
        totalModelRuns: 24,
        totalCalibrations: 4,
        executionTimeMs: 358646.55,
        errorCount: 1,
        engineVersion: '1.0.0',
      },
      errors: [{ positionId: 'pos-b', model: 'PDE', error: 'slow' }],
      portfolioAggregates: {
        dispersion: {
          Delta: { min: 50.6, max: 52.8, mean: 51.7, stddev: 0.82, models: ['BlackScholes', 'Heston', 'VarianceGamma'] },
        },
      },
      exposureSweep: [{
        underlying: 'SPY',
        spot: 634.09,
        strikeCount: 136,
        keyLevels: { regime: 'negative-gamma', gammaFlip: 645.9, callWall: 650, putWall: 620, gammaTilt: -1, secondaryFlips: [] },
        timestamp: 1774771500000,
      }],
    },
    positions: [
      {
        positionId: 'pos-a',
        symbol: 'SPY250330C00634000',
        underlying: 'SPY',
        isCall: true,
        strike: 634,
        expiration: '2026-03-30',
        daysToExpiry: 3,
        spot: 634.09,
        iv: 0.2296,
        quantity: 1,
        multiplier: 100,
        marketPrice: 4.97,
        riskFreeRate: 0.045,
        dividendYield: 0.012,
        models: {
          Heston: {
            variantCount: 1,
            representative: {
              price: 5.13,
              greeks: { Delta: 0.54, Vega: 0.31 },
              dimensions: { exerciseStyle: 'european' },
            },
            alternates: [{ price: 5.2 }],
            calibration: {
              rmse: 0.012,
              confidence: 0.94,
              isFallback: false,
              expirationDate: '2026-03-30',
              params: { kappa: 1.2, theta: 0.05 },
            },
          },
          PDE: {
            variantCount: 2,
            representative: {
              price: 5.36,
              greeks: { Delta: 0.51, Gamma: 0.03 },
              dimensions: { exerciseStyle: 'european' },
            },
            alternates: [{ price: 5.61 }],
            earlyExercisePremium: { priceAmerican: 5.61, priceEuropean: 5.36, premium: 0.25, premiumPercent: 4.66 },
          },
        },
      },
      {
        positionId: 'pos-b',
        symbol: 'QQQ250330P00500000',
        underlying: 'QQQ',
        isCall: false,
        strike: 500,
        expiration: '2026-03-30',
        daysToExpiry: 3,
        spot: 499.5,
        iv: 0.3,
        quantity: 2,
        multiplier: 100,
        marketPrice: 12.4,
        riskFreeRate: 0.045,
        dividendYield: 0.0,
        models: {
          BlackScholes: {
            variantCount: 1,
            representative: {
              price: { value: 12.1, stdError: 0.02 },
              greeks: { Delta: -0.48, Theta: -0.22 },
              dimensions: { exerciseStyle: 'european' },
            },
          },
        },
      },
    ],
  };
}

describe('shapeComputeRunRecord', () => {
  test('builds a compact assistant-facing compute-run summary', () => {
    const shaped = shapeComputeRunRecord(makeRecord()) as Record<string, any>;

    expect(shaped.runKey).toBeUndefined();
    expect(shaped.summary.totalModelRuns).toBe(24);
    expect(shaped.portfolioDispersion.Delta).toEqual({
      min: 50.6,
      max: 52.8,
      mean: 51.7,
      stddev: 0.82,
      models: ['Black-Scholes', 'Heston', 'Variance Gamma'],
    });
    expect(shaped.exposureSweep[0]).toEqual(
      expect.objectContaining({
        underlying: 'SPY',
        strikeCount: 136,
      }),
    );
    expect(shaped.positions[0].symbol).toBe('QQQ250330P00500000');
    expect(shaped.positions[0].positionId).toBeUndefined();
    expect(shaped.positions[0].modelCount).toBe(1);
    expect(shaped.positions[0].models['Black-Scholes']).toBeDefined();
    expect(shaped.positions[0].models.BlackScholes).toBeUndefined();
    expect(shaped.positions[1].models.Heston.calibrationSummary.rmse).toBe(0.012);
    expect(shaped.positions[1].models.Heston.calibrationSummary.fallback).toBeUndefined();
    expect(shaped.positions[1].models.Heston.calibrationSummary.executionPath).toBeUndefined();
    expect(shaped.positions[1].models.PDE.alternateCount).toBe(1);
  });

  test('supports legacy variant-based models and trims calibration params', () => {
    const shaped = shapeComputeRunRecord({
      run_key: 'legacy-run',
      scope: 'core',
      quality: 'balanced',
      status: 'completed',
      timestamp: 1774771200000,
      data: {
        summary: {
          totalPositions: 1,
          totalModelRuns: 2,
        },
      },
      positions: [
        {
          positionId: 'legacy-pos',
          symbol: '',
          underlying: 'AAPL',
          isCall: true,
          strike: 200,
          expiration: '2026-05-08',
          daysToExpiry: 40,
          spot: 210.25,
          iv: 0.31,
          quantity: 1,
          multiplier: 100,
          marketPrice: 5.12,
          riskFreeRate: 0.043,
          dividendYield: 0.01,
          models: {
            SABR: {
              variants: [
                {
                  price: { value: 5.123456789 },
                  greeks: {
                    Delta: { value: 0.5432109, stdError: 0.00234 },
                    Gamma: { value: 0.0212345 },
                  },
                  dimensions: { exerciseStyle: 'european' },
                },
                {
                  price: { value: 5.4 },
                  greeks: {
                    Delta: { value: 0.5 },
                  },
                  dimensions: { exerciseStyle: 'american' },
                },
              ],
              calibration: {
                rmse: 0.123456789,
                confidence: 88.98765,
                isFallback: false,
                expirationDate: '2026-05-08',
                params: {
                  alpha: 1.23456789,
                  beta: 0.5,
                  seed: 12345,
                  enabled: true,
                  timestamp: '2026-03-29T07:18:38.387Z',
                  nested: { score: 99 },
                },
              },
            },
          },
        },
      ],
    }) as Record<string, any>;

    expect(shaped.positions[0].symbol).toBe('AAPL');
    expect(shaped.positions[0].models.SABR.variantCount).toBe(2);
    expect(shaped.positions[0].models.SABR.alternateCount).toBe(1);
    expect(shaped.positions[0].models.SABR.price).toBe(5.123457);
    expect(shaped.positions[0].models.SABR.greeks).toEqual({
      Delta: { value: 0.543211, stdError: 0.00234 },
      Gamma: 0.021234,
    });
    expect(shaped.positions[0].models.SABR.dimensions).toEqual({ exerciseStyle: 'european' });
    expect(shaped.positions[0].models.SABR.calibrationSummary.params).toEqual({
      alpha: 1.234568,
      beta: 0.5,
      enabled: true,
      timestamp: '2026-03-29T07:18:38.387Z',
    });
    expect(shaped.positions[0].models.SABR.calibrationSummary.params.nested).toBeUndefined();
  });

  test('emits a prose fallback status in compact model summaries', () => {
    const record = makeRecord();
    (record.positions[0].models as any).Heston.calibration.isFallback = true;
    (record.positions[0].models as any).Heston.calibration.fallbackReason = 'insufficient_surface';

    const shaped = shapeComputeRunRecord(record) as Record<string, any>;

    expect(shaped.positions[1].models.Heston.calibrationSummary.isFallback).toBeUndefined();
    expect(shaped.positions[1].models.Heston.calibrationSummary.fallback).toBeUndefined();
    expect(shaped.positions[1].models.Heston.calibrationSummary.status).toBe('fallback (default parameters)');
    expect(shaped.positions[1].models.Heston.calibrationSummary.statusReason).toBe('insufficient surface');
    expect(shaped.positions[1].models.Heston.calibrationSummary.fallbackReason).toBeUndefined();
  });
});

describe('recordMatchesComputeFilters', () => {
  test('matches exact run and underlying filters', () => {
    const record = makeRecord();
    expect(recordMatchesComputeFilters(record, { runKey: 'run-123' })).toBe(true);
    expect(recordMatchesComputeFilters(record, { runKey: 'other' })).toBe(false);
    expect(recordMatchesComputeFilters(record, { underlying: 'qqq' })).toBe(true);
    expect(recordMatchesComputeFilters(record, { underlying: 'iwm' })).toBe(false);
  });
});

describe('sanitizeComputeRunsWireOutput', () => {
  test('humanizes full-mode key levels and removes raw isFallback booleans', () => {
    const payload = { data: [makeRecord()] };
    (payload.data[0] as any).data.portfolioAggregates.excluded = { byReason: { missingIv: 2 } };
    (payload.data[0].positions[0].models as any).Heston.calibration.fallback = true;
    (payload.data[0].positions[0].models as any).Heston.calibration.status = 'fallback (default parameters)';
    (payload.data[0].positions[0].models as any).Heston.calibration.statusReason = 'insufficient surface';
    (payload.data[0].positions[0].models as any).Heston.calibration.fallbackReason = 'insufficient_surface';
    (payload.data[0].positions[0].models as any).Heston.calibration.seedRejections = [{ reason: 'bad_seed' }];
    (payload.data[0].positions[0].models as any).Heston.calibration.executionPath = 'worker';
    (payload.data[0].positions[0].models as any).Heston.calibration.economicPenalty = 1.25;

    sanitizeComputeRunsWireOutput(payload);

    const text = JSON.stringify(payload);
    expect(text).not.toContain('portfolioAggregates');
    expect(text).not.toContain('BlackScholes');
    expect(text).toContain('Black-Scholes');
    expect(text).not.toContain('fallbackReason');
    expect(text).not.toContain('"seed"');
    expect(text).not.toContain('seedRejections');
    expect(text).not.toContain('executionPath');
    expect(text).not.toContain('economicPenalty');
    expect(text).not.toContain('byReason');
    expect(text).not.toContain('callWall');
    expect(text).not.toContain('putWall');
    expect(text).not.toContain('gammaFlip');
    expect(text).not.toContain('gammaTilt');
    expect(text).not.toContain('secondaryFlips');
    expect(text).not.toContain('isFallback');

    const keyLevels = (payload.data[0].data.exposureSweep[0] as any).keyLevels;
    expect(keyLevels['call wall']).toBe(650);
    expect(keyLevels['put wall']).toBe(620);
    expect(keyLevels['gamma flip']).toBe(645.9);
    expect(keyLevels['gamma tilt']).toBe(-1);
    expect(keyLevels['secondary flips']).toEqual([]);

    const hestonCalibration = (payload.data[0].positions[0].models as any).Heston.calibration;
    expect(hestonCalibration.isFallback).toBeUndefined();
    expect(hestonCalibration.fallback).toBeUndefined();
    expect(hestonCalibration.status).toBe('fallback (default parameters)');
    expect(hestonCalibration.statusReason).toBe('insufficient surface');
    expect(hestonCalibration.fallbackReason).toBeUndefined();
    expect(hestonCalibration.seedRejections).toBeUndefined();
    expect(hestonCalibration.executionPath).toBeUndefined();
    expect(hestonCalibration.economicPenalty).toBeUndefined();
  });

  test('preserves fallback context in full-mode sanitizer while dropping raw internals', () => {
    const payload = { data: [makeRecord()] };
    (payload.data[0].positions[0].models as any).Heston.calibration.isFallback = true;
    (payload.data[0].positions[0].models as any).Heston.calibration.fallback = true;
    (payload.data[0].positions[0].models as any).Heston.calibration.status = 'fallback';
    (payload.data[0].positions[0].models as any).Heston.calibration.statusReason = 'insufficient surface';
    (payload.data[0].positions[0].models as any).Heston.calibration.fallbackReason = 'insufficient_surface';

    sanitizeComputeRunsWireOutput(payload);

    const hestonCalibration = (payload.data[0].positions[0].models as any).Heston.calibration;
    expect(hestonCalibration.isFallback).toBeUndefined();
    expect(hestonCalibration.fallback).toBeUndefined();
    expect(hestonCalibration.status).toBe('fallback (default parameters)');
    expect(hestonCalibration.statusReason).toBe('insufficient surface');
    expect(hestonCalibration.fallbackReason).toBeUndefined();
  });

  test('drops non-fallback statusReason values from full-mode payloads', () => {
    const payload = { data: [makeRecord()] };
    (payload.data[0].positions[0].models as any).Heston.calibration.status = 'completed';
    (payload.data[0].positions[0].models as any).Heston.calibration.statusReason = 'internal_diag: seed search exhausted';

    sanitizeComputeRunsWireOutput(payload);

    const hestonCalibration = (payload.data[0].positions[0].models as any).Heston.calibration;
    expect(hestonCalibration.status).toBe('completed');
    expect(hestonCalibration.statusReason).toBeUndefined();
  });

  test('drops statusReason from fallback rows when no humanizable reason is available', () => {
    const payload = { data: [makeRecord()] };
    // isFallback=true triggers the fallback branch, but with both reason
    // fields non-humanizable (empty / non-string), the sanitizer can't produce
    // a user-facing reason and must drop the field rather than leave the raw
    // value visible.
    (payload.data[0].positions[0].models as any).Heston.calibration.isFallback = true;
    (payload.data[0].positions[0].models as any).Heston.calibration.statusReason = '';
    (payload.data[0].positions[0].models as any).Heston.calibration.fallbackReason = null;

    sanitizeComputeRunsWireOutput(payload);

    const hestonCalibration = (payload.data[0].positions[0].models as any).Heston.calibration;
    expect(hestonCalibration.status).toBe('fallback (default parameters)');
    expect(hestonCalibration.statusReason).toBeUndefined();
    expect(hestonCalibration.fallbackReason).toBeUndefined();
    expect(hestonCalibration.isFallback).toBeUndefined();
  });
});

describe('summarizeComputeRunsResponse', () => {
  function makeRichRecord(index: number) {
    const modelEntries = Object.fromEntries(
      Array.from({ length: 14 }, (_, modelIndex) => [
        `Model${modelIndex + 1}`,
        {
          variantCount: 1,
          representative: {
            price: modelIndex + 1,
            greeks: { Delta: 0.5 + modelIndex / 100, Gamma: 0.01 + modelIndex / 1000 },
            dimensions: { exerciseStyle: 'european' },
          },
          calibration: {
            rmse: 0.01 + modelIndex / 1000,
            confidence: 0.9,
            isFallback: false,
            params: { alpha: modelIndex, beta: 0.5 },
          },
        },
      ]),
    );

    const dispersion = Object.fromEntries(
      Array.from({ length: 400 }, (_, dispersionIndex) => [
        `Greek${dispersionIndex}`,
        {
          min: dispersionIndex,
          max: dispersionIndex + 10,
          mean: dispersionIndex + 5,
          stddev: 1.25,
          models: Array.from({ length: 80 }, (_, modelIndex) => `Model${modelIndex + 1}`),
        },
      ]),
    );

    return {
      ...makeRecord(),
      run_key: `rich-run-${index}`,
      timestamp: 1774771200000 - index * 1000,
      data: {
        ...(makeRecord().data as Record<string, unknown>),
        portfolioAggregates: { dispersion },
      },
      positions: Array.from({ length: 7 }, (_, positionIndex) => ({
        ...(makeRecord().positions as Array<Record<string, unknown>>)[0],
        positionId: `rich-pos-${index}-${positionIndex}`,
        symbol: `SPY250330C00634${positionIndex}`,
        marketPrice: 10 + positionIndex,
        models: modelEntries,
      })),
    };
  }

  test('adds a top-level summary while keeping shaped run rows', () => {
    const summarized = summarizeComputeRunsResponse({
      data: [makeRecord()],
      count: 1,
    }) as Record<string, any>;

    expect(summarized.data).toHaveLength(1);
    expect(summarized.data[0].portfolioDispersion.Delta.models).toBeUndefined();
    expect(summarized.data[0].positions[0].models).toBeUndefined();
    expect(summarized.data[0].positions[0].modelSummary).toBeDefined();
    expect(summarized.summary).toEqual({
      returnedRuns: 1,
      latestStatus: 'completed',
      latestStartedAt: '2026-03-29T08:00:00.000Z',
      statuses: ['completed'],
      scopes: ['full'],
      qualities: ['balanced'],
      underlyings: ['SPY', 'QQQ'],
    });
  });

  test('summarizes per-position model consensus in multi-run responses instead of returning nested model dumps', () => {
    const base = makeRecord();
    const modelEntries = Object.fromEntries(
      Array.from({ length: 14 }, (_, index) => [
        `Model${index + 1}`,
        {
          variantCount: 1,
          representative: {
            price: index + 1,
            greeks: { Delta: 0.5 + index / 100 },
            dimensions: { exerciseStyle: 'european' },
          },
        },
      ]),
    );

    const runs = Array.from({ length: 5 }, (_, index) => ({
      ...base,
      run_key: `run-${index + 1}`,
      timestamp: 1774771200000 - index * 1000,
      positions: Array.from({ length: 4 }, (_, positionIndex) => ({
          ...(base.positions as Array<Record<string, unknown>>)[0],
          positionId: `pos-${index}-${positionIndex}`,
          symbol: `SPY250330C00634${positionIndex}`,
          models: modelEntries,
        })),
    }));

    const summarized = summarizeComputeRunsResponse({
      data: runs,
      count: runs.length,
    }) as Record<string, any>;

    expect(summarized.summary.returnedRuns).toBe(5);
    expect(summarized.data[0].positions).toHaveLength(2);
    expect(summarized.data[0].positionsNotShown).toBe(2);
    expect(summarized.data[0].omittedPositionCount).toBeUndefined();
    expect(summarized.data[0].positions[0].models).toBeUndefined();
    expect(summarized.data[0].positions[0].modelsNotShown).toBeUndefined();
    expect(summarized.data[0].positions[0].omittedModelCount).toBeUndefined();
    expect(summarized.data[0].positions[0].modelSummary).toEqual({
      modelCount: 14,
      modelsPreview: ['Model1', 'Model2', 'Model3'],
      calibratedModelCount: 0,
      price: { min: 1, max: 14, mean: 7.5 },
      greeksAvailable: ['Delta'],
    });
  });

  test('keeps rich multi-run responses compact without nested model dumps', () => {
    const summarized = summarizeComputeRunsResponse({
      data: [makeRichRecord(0), makeRichRecord(1), makeRichRecord(2)],
      count: 3,
    }) as Record<string, any>;

    expect(JSON.stringify(summarized).length).toBeLessThan(50 * 1024);
    expect(summarized.data[0].runKey).toBeUndefined();
    expect(summarized.summary.returnedRuns).toBe(summarized.data.length);
    expect(summarized._truncation_meta).toBeUndefined();
    expect(summarized.data).toHaveLength(3);
    expect(summarized.data[0].positions).toHaveLength(2);
    expect(summarized.data[0].positions[0].models).toBeUndefined();
    expect(summarized.data[0].positions[0].modelSummary).toBeDefined();
  });

  test('keeps a single rich run compact enough for the MCP budget', () => {
    const summarized = summarizeComputeRunsResponse({
      data: [makeRichRecord(0)],
      count: 1,
    }) as Record<string, any>;

    expect(JSON.stringify(summarized).length).toBeLessThan(50 * 1024);
    expect(summarized.data).toHaveLength(1);
    expect(summarized.summary.returnedRuns).toBe(1);
    expect(summarized._truncation_meta).toBeUndefined();
    expect(summarized.data[0].positions).toHaveLength(5);
    expect(summarized.data[0].positions[0].models).toBeUndefined();
    expect(summarized.data[0].positions[0].modelSummary).toBeDefined();
  });

  test('view=detailed preserves per-model details for a single returned run', () => {
    const record = makeRichRecord(0);
    const modelNames = Array.from({ length: 14 }, (_, index) => `Model${index + 1}`);
    (record.data as Record<string, any>).portfolioAggregates = {
      dispersion: {
        Price: { min: 1, max: 14, mean: 7.5, stddev: 2.5, models: modelNames },
        Delta: { min: 0.5, max: 0.64, mean: 0.57, stddev: 0.04, models: modelNames },
      },
    };

    const summarized = summarizeComputeRunsResponse({
      data: [record],
      count: 1,
    }, 'detailed') as Record<string, any>;

    expect(JSON.stringify(summarized).length).toBeLessThan(50 * 1024);
    expect(summarized.data).toHaveLength(1);
    const dispersionMetric = Object.values(summarized.data[0].portfolioDispersion ?? {})[0] as Record<string, unknown> | undefined;
    expect(dispersionMetric?.models).toBeDefined();
    expect(summarized.data[0]._portfolioDispersion_meta).toBeUndefined();
    expect(summarized.data[0].positions[0].models).toBeDefined();
    expect(summarized.data[0].positions[0].modelSummary).toBeUndefined();
  });

  test('view=detailed is ignored for multi-run responses', () => {
    const summarized = summarizeComputeRunsResponse({
      data: [makeRichRecord(0), makeRichRecord(1)],
      count: 2,
    }, 'detailed') as Record<string, any>;

    expect(summarized.data).toHaveLength(2);
    const dispersionMetric = Object.values(summarized.data[0].portfolioDispersion ?? {})[0] as Record<string, unknown> | undefined;
    expect(dispersionMetric?.models).toBeUndefined();
    expect(summarized.data[0].positions[0].models).toBeUndefined();
    expect(summarized.data[0].positions[0].modelSummary).toBeDefined();
  });
});
