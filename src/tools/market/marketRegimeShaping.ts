type MarketRegimeMarket = {
  [key: string]: unknown;
  vector?: unknown;
  drivers?: unknown;
  exposures?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

/** Convert a snake_case backend feature identifier to a human-readable label
 *  (e.g. `tail_dominance` → "Tail Dominance"). LLM clients surface the value
 *  as-is to end users, so the wire representation needs to read like prose. */
export function humanizeFeature(name: string): string {
  return name
    .split('_')
    .map((s) => (s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()))
    .join(' ');
}

/** Rewrite each driver entry's `feature` value (and any `key`-style alias) to
 *  the humanized label. Returns a new array; leaves non-array input untouched. */
export function humanizeDrivers(drivers: unknown): unknown {
  if (!Array.isArray(drivers)) return drivers;
  return drivers.map((entry) => {
    if (!isRecord(entry)) return entry;
    const next: Record<string, unknown> = { ...entry };
    if (typeof next.feature === 'string') next.feature = humanizeFeature(next.feature);
    return next;
  });
}

/** Rewrite the keys of a feature-keyed record (e.g. z-scores, raw values) to
 *  humanized labels. Values are passed through unchanged. */
export function humanizeFeatureRecord(rec: unknown): unknown {
  if (!isRecord(rec)) return rec;
  return Object.fromEntries(Object.entries(rec).map(([k, v]) => [humanizeFeature(k), v]));
}

export function shapeMarketRegimeResponse(payload: unknown): unknown {
  if (!isRecord(payload) || !isRecord(payload.market)) return payload;

  const market = payload.market as MarketRegimeMarket;
  const shaped: Record<string, unknown> = { ...market };
  const vector = isRecord(market.vector) ? market.vector : null;
  const zScores = vector && isRecord(vector.z) ? vector.z : null;

  if (zScores) {
    shaped.feature_z_scores = humanizeFeatureRecord(zScores);
    shaped._feature_vector_meta = { raw_internals_omitted: true };
  }

  if (Array.isArray(market.drivers)) {
    shaped.drivers = humanizeDrivers(market.drivers);
  }

  delete shaped.vector;

  return { ...payload, market: shaped };
}
