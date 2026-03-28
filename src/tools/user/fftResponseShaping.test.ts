import { describe, test, expect } from 'bun:test';
import {
  flattenObjects,
  pickBestComparisons,
  truncateArrays,
  shapeRecord,
  truncateRecord,
  TRUNCATION_THRESHOLD,
  PRESERVE_KEYS,
  SKIP_TRUNCATE_KEYS,
} from './fftResponseShaping.js';

// ─── Helpers ─────────────────────────────────────────────────────────

/** Build a minimal comparison entry. */
function makeComp(overrides: Record<string, unknown> = {}) {
  return {
    strike: 100,
    type: 'call',
    moneyness: 'OTM',
    marketBid: 1.0,
    marketAsk: 1.2,
    marketMid: 1.1,
    volume: 500,
    openInterest: 2000,
    modelPrices: { blackScholes: 1.15 },
    modelSignals: { blackScholes: 'buy' },
    modelDiffs: { blackScholes: 4.5 },
    agreement: 'mixed',
    avgModelPrice: 1.15,
    priceSpread: 0.0,
    expiration: '2026-04-24',
    daysToExpiry: 28,
    ...overrides,
  };
}

/** Build a single-model FFT record as synced from the web app. */
function makeSingleModelRecord() {
  return {
    id: 1,
    user_id: 1,
    symbol: 'TSLA',
    timestamp: Date.now(),
    data: {
      expiration: '2026-04-24',
      daysToExpiry: 28,
      spot: 374.25,
      processType: 'heston',
      scanTimeMs: 120,
      summary: { totalScanned: 50, buySignals: 12, sellSignals: 8, bestEdge: 15.2, avgEdge: 3.1, avgAbsEdge: 5.4 },
      bestValues: { bestCall: { strike: 380, edge: 15.2 }, bestPut: { strike: 360, edge: 12.1 } },
    },
    details: {
      calibration: { rmse: 0.023, isFallback: false, timeMs: 85, executionPath: 'worker' },
    },
  };
}

/** Build a multi-model FFT record with N comparison entries. */
function makeMultiModelRecord(numComparisons: number, spot = 374.25) {
  const comparison = Array.from({ length: numComparisons }, (_, i) => {
    const strike = 300 + i * 2;
    const distFromSpot = Math.abs(strike - spot);
    return makeComp({
      strike,
      moneyness: distFromSpot < 5 ? 'ATM' : strike > spot ? 'OTM' : 'ITM',
      agreement: i % 10 === 0 ? 'unanimous_buy' : i % 7 === 0 ? 'majority_sell' : 'mixed',
      modelDiffs: { bs: 2 + i * 0.3, heston: -(1 + i * 0.2), vg: 5 + i * 0.5 },
      priceSpread: 0.1 + i * 0.01,
      marketMid: 1.0 + i * 0.1,
    });
  });
  return {
    id: 2,
    user_id: 1,
    symbol: 'AAPL',
    timestamp: Date.now(),
    data: {
      processType: 'multiModel',
      expiration: '2026-04-24',
      daysToExpiry: 28,
      spot,
      scanTimeMs: 450,
      models: ['blackScholes', 'heston', 'varianceGamma', 'merton', 'kou', 'bates', 'sabr'],
      failedModels: [{ model: 'sabr', error: 'did not converge' }],
    },
    details: { comparison },
  };
}

// ─── flattenObjects ──────────────────────────────────────────────────

describe('flattenObjects', () => {
  test('preserves calibration, summary, and bestValues inline', () => {
    const obj = {
      spot: 374.25,
      calibration: { rmse: 0.023, isFallback: false },
      summary: { totalScanned: 50, buySignals: 12 },
      bestValues: { bestCall: { strike: 380 } },
      someOther: { nested: true },
    };
    const result = flattenObjects(obj);
    expect(result.calibration).toEqual({ rmse: 0.023, isFallback: false });
    expect(result.summary).toEqual({ totalScanned: 50, buySignals: 12 });
    expect(result.bestValues).toEqual({ bestCall: { strike: 380 } });
    expect(result.someOther).toBe('[nested object]');
    expect(result.spot).toBe(374.25);
  });

  test('keeps arrays intact', () => {
    const obj = { models: ['bs', 'heston'], count: 5 };
    const result = flattenObjects(obj);
    expect(result.models).toEqual(['bs', 'heston']);
    expect(result.count).toBe(5);
  });

  test('handles null and undefined values', () => {
    const obj = { a: null, b: undefined, c: 'text' };
    const result = flattenObjects(obj);
    expect(result.a).toBeNull();
    expect(result.b).toBeUndefined();
    expect(result.c).toBe('text');
  });
});

// ─── truncateArrays ─────────────────────────────────────────────────

describe('truncateArrays', () => {
  test('skips arrays at or under maxItems', () => {
    const obj = { items: [1, 2, 3, 4, 5] };
    truncateArrays(obj, 5);
    expect(obj.items).toEqual([1, 2, 3, 4, 5]);
  });

  test('truncates generic arrays with simple slice', () => {
    const obj = { items: [1, 2, 3, 4, 5, 6, 7, 8] };
    truncateArrays(obj, 3);
    const result = obj.items as any;
    expect(result._count).toBe(8);
    expect(result._preview).toEqual([1, 2, 3]);
    expect(result._note).toContain('3 of 8');
    expect(result._note).not.toContain('strongest signals');
  });

  test('never truncates models or failedModels arrays', () => {
    const models = ['bs', 'heston', 'vg', 'merton', 'kou', 'bates', 'sabr'];
    const failedModels = Array.from({ length: 10 }, (_, i) => ({ model: `m${i}` }));
    const obj = { models: [...models], failedModels: [...failedModels] };
    truncateArrays(obj, 3);
    expect(obj.models).toEqual(models);
    expect(obj.failedModels).toEqual(failedModels);
  });

  test('uses signal-aware selection for comparison arrays', () => {
    const comparison = [
      makeComp({ strike: 300, agreement: 'mixed', modelDiffs: { bs: 1 } }),
      makeComp({ strike: 350, agreement: 'unanimous_buy', modelDiffs: { bs: 30 } }),
      makeComp({ strike: 375, agreement: 'unanimous_sell', modelDiffs: { bs: 40 } }),
      makeComp({ strike: 400, agreement: 'majority_buy', modelDiffs: { bs: 5 } }),
      makeComp({ strike: 450, agreement: 'mixed', modelDiffs: { bs: 2 } }),
      makeComp({ strike: 500, agreement: 'mixed', modelDiffs: { bs: 1 } }),
    ];
    const obj = { comparison: [...comparison] };
    truncateArrays(obj, 3);
    const result = obj.comparison as any;
    expect(result._count).toBe(6);
    expect(result._preview).toHaveLength(3);
    expect(result._note).toContain('strongest signals');
    // Unanimous entries should be picked first
    const strikes = result._preview.map((c: any) => c.strike);
    expect(strikes).toContain(350); // unanimous_buy
    expect(strikes).toContain(375); // unanimous_sell
  });
});

// ─── pickBestComparisons ─────────────────────────────────────────────

describe('pickBestComparisons', () => {
  test('unanimous beats majority beats mixed', () => {
    const arr = [
      makeComp({ strike: 100, agreement: 'mixed', modelDiffs: { bs: 1 } }),
      makeComp({ strike: 200, agreement: 'majority_buy', modelDiffs: { bs: 1 } }),
      makeComp({ strike: 300, agreement: 'unanimous_sell', modelDiffs: { bs: 1 } }),
    ];
    const result = pickBestComparisons(arr, 2);
    expect(result[0].strike).toBe(300); // unanimous
    expect(result[1].strike).toBe(200); // majority
  });

  test('uses modelDiffs to break ties within same agreement tier', () => {
    const arr = [
      makeComp({ strike: 100, agreement: 'mixed', modelDiffs: { bs: 5 } }),
      makeComp({ strike: 200, agreement: 'mixed', modelDiffs: { bs: 40 } }),
      makeComp({ strike: 300, agreement: 'mixed', modelDiffs: { bs: 20 } }),
    ];
    const result = pickBestComparisons(arr, 2);
    expect(result[0].strike).toBe(200); // highest abs diff (40)
    expect(result[1].strike).toBe(300); // second highest (20)
  });

  test('ATM proximity acts as tiebreaker with spot', () => {
    const arr = [
      makeComp({ strike: 100, agreement: 'mixed', modelDiffs: { bs: 5 }, moneyness: 'ITM' }),
      makeComp({ strike: 375, agreement: 'mixed', modelDiffs: { bs: 5 }, moneyness: 'ATM' }),
      makeComp({ strike: 500, agreement: 'mixed', modelDiffs: { bs: 5 }, moneyness: 'OTM' }),
    ];
    const result = pickBestComparisons(arr, 1, 374);
    expect(result[0].strike).toBe(375); // ATM gets +20 bonus
  });

  test('spot-based distance scoring favours near-money strikes', () => {
    // Both non-ATM, same agreement and diffs — spot distance decides
    const arr = [
      makeComp({ strike: 200, agreement: 'mixed', modelDiffs: { bs: 5 }, moneyness: 'ITM' }),
      makeComp({ strike: 370, agreement: 'mixed', modelDiffs: { bs: 5 }, moneyness: 'OTM' }),
    ];
    const result = pickBestComparisons(arr, 1, 374);
    expect(result[0].strike).toBe(370); // much closer to spot
  });
});

// ─── shapeRecord ─────────────────────────────────────────────────────

describe('shapeRecord', () => {
  test('preserves calibration in details for single-model records', () => {
    const record = makeSingleModelRecord();
    shapeRecord(record);
    expect(record.details.calibration).toEqual({
      rmse: 0.023,
      isFallback: false,
      timeMs: 85,
      executionPath: 'worker',
    });
  });

  test('preserves summary and bestValues in data', () => {
    const record = makeSingleModelRecord();
    shapeRecord(record);
    expect(record.data.summary).toBeDefined();
    expect((record.data.summary as any).buySignals).toBe(12);
    expect(record.data.bestValues).toBeDefined();
    expect((record.data.bestValues as any).bestCall.strike).toBe(380);
  });

  test('flattens unknown nested objects', () => {
    const record = {
      data: { spot: 100, unknownNested: { deep: true } },
      details: { unknownNested: { deep: true } },
    };
    shapeRecord(record);
    expect(record.data.unknownNested).toBe('[nested object]');
    expect(record.details.unknownNested).toBe('[nested object]');
  });

  test('handles records with null/missing data or details', () => {
    const record = { data: null, details: undefined } as any;
    expect(() => shapeRecord(record)).not.toThrow();
  });
});

// ─── truncateRecord ──────────────────────────────────────────────────

describe('truncateRecord', () => {
  test('preserves models array on multi-model records', () => {
    const record = makeMultiModelRecord(200);
    truncateRecord(record);
    expect(record.data.models).toEqual([
      'blackScholes', 'heston', 'varianceGamma', 'merton', 'kou', 'bates', 'sabr',
    ]);
  });

  test('preserves failedModels array', () => {
    const record = makeMultiModelRecord(200);
    truncateRecord(record);
    expect(record.data.failedModels).toEqual([{ model: 'sabr', error: 'did not converge' }]);
  });

  test('truncates comparison on oversized records', () => {
    const record = makeMultiModelRecord(200);
    truncateRecord(record);
    const comp = record.details.comparison as any;
    expect(comp._count).toBe(200);
    expect(comp._preview).toHaveLength(5);
    expect(comp._note).toContain('strongest signals');
  });

  test('passes spot from data to comparison selection', () => {
    const spot = 374.25;
    // Build a record where all entries are 'mixed' with similar diffs,
    // so ATM proximity becomes the deciding factor
    const comparison = Array.from({ length: 10 }, (_, i) => {
      const strike = 300 + i * 20;
      return makeComp({
        strike,
        moneyness: Math.abs(strike - spot) < 5 ? 'ATM' : 'OTM',
        agreement: 'mixed',
        modelDiffs: { bs: 5 },
        priceSpread: 0.1,
        marketMid: 1.0,
      });
    });
    const record = {
      id: 1, user_id: 1, symbol: 'AAPL', timestamp: Date.now(),
      data: { processType: 'multiModel', spot, models: ['bs'] },
      details: { comparison },
    };
    truncateRecord(record);
    const preview = (record.details.comparison as any)._preview;
    const strikes = preview.map((c: any) => c.strike) as number[];
    // Strikes nearest to spot (380, 360) should be favoured over far wings (300, 500)
    expect(strikes).toContain(380); // closest to 374.25
    expect(strikes).not.toContain(300); // deep wing, far from spot
  });
});

// ─── Integration: under-budget rows stay intact ──────────────────────

describe('size-aware truncation', () => {
  test('small single-model record stays fully intact', () => {
    const record = makeSingleModelRecord();
    const res = { data: [record] };

    // Shape
    for (const r of res.data) shapeRecord(r);

    // Should be well under threshold
    expect(JSON.stringify(res).length).toBeLessThan(TRUNCATION_THRESHOLD);

    // So truncation pass would NOT run — verify data is untouched
    expect(record.data.summary).toBeDefined();
    expect(record.data.bestValues).toBeDefined();
    expect(record.details.calibration).toBeDefined();
  });

  test('AAPL-sized record exceeds threshold after shaping', () => {
    const record = makeMultiModelRecord(250);
    const res = { data: [record] };
    for (const r of res.data) shapeRecord(r);
    // 250 comparisons should exceed 40KB
    expect(JSON.stringify(res).length).toBeGreaterThan(TRUNCATION_THRESHOLD);
  });

  test('moderate multi-model record stays under threshold', () => {
    // ~50 comparisons should fit
    const record = makeMultiModelRecord(50);
    const res = { data: [record] };
    for (const r of res.data) shapeRecord(r);
    expect(JSON.stringify(res).length).toBeLessThan(TRUNCATION_THRESHOLD);
  });
});
