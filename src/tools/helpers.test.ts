import { describe, expect, test } from 'bun:test';
import { applyResponseSizeGuard } from './helpers.js';

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
    expect(parsed._data_note).toContain('Aggressively trimmed to first 5 items');
  });

  test('aggressively trims oversized root arrays before falling back to an error payload', () => {
    const payload = Array.from({ length: 120 }, (_, index) => ({
      id: index,
      blob: 'x'.repeat(1200),
    }));

    const parsed = JSON.parse(applyResponseSizeGuard(payload, 50 * 1024));

    expect(Array.isArray(parsed)).toBeTrue();
    expect(parsed.slice(0, 5)).toHaveLength(5);
    expect(parsed[5]._note).toContain('Aggressively trimmed to first 5 items');
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
    // First 5 elements are the records (ids 0-4), last element is the _note
    expect(parsed.slice(0, 5).map((row: { id: number }) => row.id)).toEqual([0, 1, 2, 3, 4]);
    expect(parsed[5]._note).toBeDefined();
  });
});
