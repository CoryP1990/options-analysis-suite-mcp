type RiskFreeRatePayload = {
  [key: string]: unknown;
  rate?: unknown;
  value?: unknown;
  maturity?: unknown;
  source?: unknown;
  provider?: unknown;
  timestamp?: unknown;
};

export function annotateRiskFreeRate(payload: unknown): unknown {
  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  const response = payload as RiskFreeRatePayload;
  if (response.maturity !== '10Y') return response;

  return {
    ...response,
    _rate_meta: { source: 'platform 10Y benchmark', maturity: '10Y' },
  };
}
