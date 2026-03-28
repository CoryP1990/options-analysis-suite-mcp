import { describe, expect, it } from 'bun:test';
import { shapeAnnotationsResponse } from './annotationsShaping.js';

describe('shapeAnnotationsResponse', () => {
  it('returns a truthful empty state when no annotations exist', () => {
    const shaped = shapeAnnotationsResponse({ data: [], count: 0 }) as Record<string, any>;

    expect(shaped.count).toBe(0);
    expect(shaped.annotations).toEqual([]);
    expect(shaped.summary).toEqual({
      symbolsCovered: 0,
      typeCounts: {},
    });
    expect(String(shaped._note)).toContain('No synced annotations found yet');
  });

  it('normalizes annotations and adds summary counts', () => {
    const shaped = shapeAnnotationsResponse({
      data: [
        {
          symbol: 'AAPL',
          type: 'note',
          timestamp: 123,
          data: { text: 'Watch earnings' },
        },
        {
          symbol: 'TSLA',
          type: 'alert',
          timestamp: 456,
          data: { condition: 'breakout' },
        },
        {
          symbol: 'AAPL',
          type: 'tag',
          timestamp: 789,
          data: { label: 'core' },
        },
      ],
      count: 3,
    }) as Record<string, any>;

    expect(shaped.count).toBe(3);
    expect(shaped.annotations).toHaveLength(3);
    expect(shaped.annotations[0]).toEqual({
      symbol: 'AAPL',
      type: 'note',
      timestamp: 123,
      details: { text: 'Watch earnings' },
    });
    expect(shaped.summary).toEqual({
      symbolsCovered: 2,
      typeCounts: {
        note: 1,
        alert: 1,
        tag: 1,
      },
    });
  });
});
