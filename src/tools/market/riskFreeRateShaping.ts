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
    _rate_note: 'Current risk-free-rate endpoint returns the platform-wide 10Y Treasury benchmark. Use get_yield_curve for shorter maturities such as 1M or 3M.',
  };
}
