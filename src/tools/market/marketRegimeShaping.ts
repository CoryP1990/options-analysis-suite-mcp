type MarketRegimeMarket = {
  [key: string]: unknown;
  vector?: unknown;
  exposures?: unknown;
};

type MarketRegimeResponse = {
  [key: string]: unknown;
  market?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

export function shapeMarketRegimeResponse(payload: unknown): unknown {
  if (!isRecord(payload) || !isRecord(payload.market)) return payload;

  const market = payload.market as MarketRegimeMarket;
  const shaped: Record<string, unknown> = { ...market };
  const vector = isRecord(market.vector) ? market.vector : null;
  const zScores = vector && isRecord(vector.z) ? vector.z : null;

  if (zScores) {
    shaped.feature_z_scores = zScores;
    shaped._feature_vector_note = 'Raw feature-vector internals are omitted from the default market summary; use include_symbols=true for the full regime payload.';
  }

  delete shaped.vector;

  return { ...payload, market: shaped };
}
