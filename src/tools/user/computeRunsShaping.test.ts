import { describe, expect, test } from 'bun:test';
import { recordMatchesComputeFilters, shapeComputeRunRecord, summarizeComputeRunsResponse } from './computeRunsShaping.js';

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
          Delta: { min: 50.6, max: 52.8, mean: 51.7, stddev: 0.82, models: ['BlackScholes', 'Heston'] },
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

    expect(shaped.runKey).toBe('run-123');
    expect(shaped.summary.totalModelRuns).toBe(24);
    expect(shaped.portfolioDispersion.Delta).toEqual({
      min: 50.6,
      max: 52.8,
      mean: 51.7,
      stddev: 0.82,
      models: ['BlackScholes', 'Heston'],
    });
    expect(shaped.exposureSweep[0]).toEqual(
      expect.objectContaining({
        underlying: 'SPY',
        strikeCount: 136,
      }),
    );
    expect(shaped.positions[0].symbol).toBe('QQQ250330P00500000');
    expect(shaped.positions[0].modelCount).toBe(1);
    expect(shaped.positions[1].models.Heston.calibrationSummary.rmse).toBe(0.012);
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

describe('summarizeComputeRunsResponse', () => {
  test('adds a top-level summary while keeping shaped run rows', () => {
    const summarized = summarizeComputeRunsResponse({
      data: [makeRecord()],
      count: 1,
    }) as Record<string, any>;

    expect(summarized.data).toHaveLength(1);
    expect(summarized.summary).toEqual({
      returnedRuns: 1,
      latestRunKey: 'run-123',
      latestStatus: 'completed',
      latestStartedAt: '2026-03-29T08:00:00.000Z',
      statuses: ['completed'],
      scopes: ['full'],
      qualities: ['balanced'],
      underlyings: ['SPY', 'QQQ'],
    });
  });

  test('trims per-position model lists in larger multi-run responses to stay assistant-friendly', () => {
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
      positions: [
        {
          ...(base.positions as Array<Record<string, unknown>>)[0],
          models: modelEntries,
        },
      ],
    }));

    const summarized = summarizeComputeRunsResponse({
      data: runs,
      count: runs.length,
    }) as Record<string, any>;

    expect(summarized.summary.returnedRuns).toBe(5);
    expect(summarized.data[0].positions[0].modelCount).toBe(14);
    expect(Object.keys(summarized.data[0].positions[0].models)).toHaveLength(5);
    expect(summarized.data[0].positions[0].omittedModelCount).toBe(9);
  });
});
