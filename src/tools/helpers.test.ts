import { describe, expect, test } from 'bun:test';
import { applyResponseSizeGuard, sanitizeMcpWireOutput } from './helpers.js';

describe('applyResponseSizeGuard', () => {
  test('keeps sub-50KB responses intact even when arrays exceed 50 items', () => {
    const payload = {
      data: Array.from({ length: 60 }, (_, index) => ({
        date: `2026-03-${String(index + 1).padStart(2, '0')}`,
        close: 600 + index,
        volume: 1_000_000 + index,
      })),
    };

    const parsed = JSON.parse(applyResponseSizeGuard(payload));

    expect(parsed.data).toHaveLength(60);
    expect(parsed._data_note).toBeUndefined();
    expect(parsed._data_meta).toBeUndefined();
  });

  test('truncates oversized nested arrays only after the raw response exceeds the byte budget', () => {
    const payload = {
      data: Array.from({ length: 120 }, (_, index) => ({
        id: index,
        blob: 'x'.repeat(1200),
      })),
    };

    const parsed = JSON.parse(applyResponseSizeGuard(payload, 50 * 1024));

    expect(parsed.data).toHaveLength(5);
    // After both passes, the aggressive meta records the post-first-pass length (51)
    expect(parsed._data_meta).toBeUndefined();
  });

  test('aggressively trims oversized root arrays before falling back to an error payload', () => {
    const payload = Array.from({ length: 120 }, (_, index) => ({
      id: index,
      blob: 'x'.repeat(1200),
    }));

    const parsed = JSON.parse(applyResponseSizeGuard(payload, 50 * 1024));

    expect(Array.isArray(parsed)).toBeTrue();
    expect(parsed.slice(0, 5)).toHaveLength(5);
    expect(parsed[5]).toMatchObject({
      truncated: true,
      aggressive: true,
      returned: 5,
    });
  });

  test('keeps the FIRST N items when aggressively trimming a nested data array', () => {
    // Sync tools sort timestamp DESC, so index 0 is newest. The guard must
    // preserve the newest records, not silently drop them by taking slice(-5).
    const payload = {
      data: Array.from({ length: 120 }, (_, index) => ({
        id: index,
        blob: 'x'.repeat(1200),
      })),
    };

    const parsed = JSON.parse(applyResponseSizeGuard(payload, 50 * 1024));

    expect(parsed.data).toHaveLength(5);
    // The first 5 items (ids 0-4) must survive — they're the newest for
    // sync-backed tools. The last 5 (ids 115-119, oldest) must be gone.
    expect(parsed.data.map((row: { id: number }) => row.id)).toEqual([0, 1, 2, 3, 4]);
  });

  test('keeps the FIRST N items when aggressively trimming a root array', () => {
    const payload = Array.from({ length: 120 }, (_, index) => ({
      id: index,
      blob: 'x'.repeat(1200),
    }));

    const parsed = JSON.parse(applyResponseSizeGuard(payload, 50 * 1024));

    expect(Array.isArray(parsed)).toBeTrue();
    // First 5 elements are the records (ids 0-4), last element is the truncation metadata
    expect(parsed.slice(0, 5).map((row: { id: number }) => row.id)).toEqual([0, 1, 2, 3, 4]);
    expect(parsed[5].truncated).toBe(true);
    expect(parsed[5].aggressive).toBe(true);
  });
});

describe('sanitizeMcpWireOutput', () => {
  test('removes underscore metadata fields while preserving useful preview payloads', () => {
    const sanitized = sanitizeMcpWireOutput({
      _stress_score_note: 'internal note',
      _symbols_truncation_meta: { selection: 'top symbols', tiers: {} },
      _venues_note: 'No ATS venue breakdown',
      _rate_meta: { source: 'platform 10Y benchmark', maturity: '10Y' },
      comparison: {
        _count: 20,
        _preview: [{ strike: 380, agreement: 'majority buy' }],
        _meta: { showing: 5, total: 20 },
      },
      data: [{ symbol: 'SPY' }],
    }) as Record<string, any>;

    expect(sanitized._stress_score_note).toBeUndefined();
    expect(sanitized._symbols_truncation_meta).toBeUndefined();
    expect(sanitized.stressScoreNote).toBe('internal note');
    expect(sanitized.symbolCoverage).toEqual({ selection: 'top symbols', tiers: {} });
    expect(sanitized.venuesNote).toBe('No ATS venue breakdown');
    expect(sanitized.rateContext).toEqual({ source: 'platform 10Y benchmark', maturity: '10Y' });
    expect(sanitized.comparison.count).toBe(20);
    expect(sanitized.comparison.preview).toEqual([{ strike: 380, agreement: 'majority buy' }]);
    expect(sanitized.comparison._count).toBeUndefined();
    expect(sanitized.comparison._preview).toBeUndefined();
    expect(sanitized.comparison._meta).toBeUndefined();
  });

  test('strips sync row database identifiers without dropping market data ids', () => {
    const sanitized = sanitizeMcpWireOutput({
      data: [
        { id: 22, user_id: 316, created_at: '2026-04-01', run_key: 'abc', status: 'completed' },
        { id: 23, data: {}, timestamp: 1770000000000, event: 'market-row-like-shape' },
        { id: 'filing-1', formType: '10-K' },
      ],
    }) as Record<string, any>;

    expect(sanitized.data[0].id).toBeUndefined();
    expect(sanitized.data[0].user_id).toBeUndefined();
    expect(sanitized.data[0].created_at).toBeUndefined();
    expect(sanitized.data[0].run_key).toBeUndefined();
    expect(sanitized.data[1].id).toBe(23);
    expect(sanitized.data[2].id).toBe('filing-1');
  });

  test('strips internal snapshot and position identifiers from nested sync payloads', () => {
    const sanitized = sanitizeMcpWireOutput({
      data: [{
        runKey: 'run-123',
        details: { snapshotId: 2 },
        summary: { portfolioSnapshotId: 7, riskSnapshotId: 8 },
        positions: [{ positionId: 'pos-a', symbol: 'AAPL 250C' }],
      }],
    }) as Record<string, any>;

    expect(sanitized.data[0].runKey).toBeUndefined();
    expect(sanitized.data[0].details.snapshotId).toBeUndefined();
    expect(sanitized.data[0].summary.portfolioSnapshotId).toBeUndefined();
    expect(sanitized.data[0].summary.riskSnapshotId).toBeUndefined();
    expect(sanitized.data[0].positions[0].positionId).toBeUndefined();
  });

  test('strips nested sync snapshot ids and raw contribution arrays without dropping market ids', () => {
    const sanitized = sanitizeMcpWireOutput({
      data: [
        {
          id: 2,
          timestamp: 1776550587306,
          totalValue: 107864.29,
          delta: 309.6892,
        },
        {
          id: 3,
          timestamp: 1776550584312,
          portfolioValue: 161179.82,
          positionContributions: [{ symbol: 'AAPL', contribution: 1200 }],
          position_contributions: [{ symbol: 'META', contribution: -800 }],
        },
        {
          id: 23,
          data: {},
          timestamp: 1770000000000,
          event: 'market-row-like-shape',
        },
      ],
    }) as Record<string, any>;

    expect(sanitized.data[0].id).toBeUndefined();
    expect(sanitized.data[1].id).toBeUndefined();
    expect(sanitized.data[1].positionContributions).toBeUndefined();
    expect(sanitized.data[1].position_contributions).toBeUndefined();
    expect(sanitized.data[2].id).toBe(23);
  });
});
