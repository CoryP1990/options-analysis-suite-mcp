import { describe, expect, test } from 'bun:test';
import { annotateRiskFreeRate } from './riskFreeRateShaping.js';

describe('annotateRiskFreeRate', () => {
  test('adds an explicit maturity note for the current 10Y benchmark endpoint', () => {
    const shaped = annotateRiskFreeRate({
      rate: 0.0433,
      value: 4.33,
      provider: 'fred',
      source: 'FRED (Supabase)',
      maturity: '10Y',
      timestamp: '2026-03-25',
    }) as Record<string, unknown>;

    expect(shaped.maturity).toBe('10Y');
    expect(shaped._rate_note).toBe(
      'Current risk-free-rate endpoint returns the platform-wide 10Y Treasury benchmark. Use get_rates with view="curve" for shorter maturities such as 1M or 3M.',
    );
  });

  test('leaves non-10Y payloads unchanged', () => {
    const payload = {
      rate: 0.038,
      value: 3.8,
      maturity: '3M',
      timestamp: '2026-03-25',
    };

    expect(annotateRiskFreeRate(payload)).toEqual(payload);
  });
});
