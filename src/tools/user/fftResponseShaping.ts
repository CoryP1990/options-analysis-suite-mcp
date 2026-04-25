/**
 * FFT Response Shaping
 *
 * Pure functions for trimming FFT scan results to fit the MCP 50 KB
 * response budget while preserving the most useful signal data.
 */

/** Byte threshold at which we start truncating arrays.
 *  Below the 50 KB hard limit in helpers.ts to leave headroom. */
export const TRUNCATION_THRESHOLD = 40 * 1024;

/** Hard ceiling used by the FFT tool's internal size-trim pass.
 *  Leaves headroom below the 50 KB MCP response limit so the generic
 *  size guard never kicks in and silently collapses the response. */
export const FFT_SAFE_SIZE_BUDGET = 48 * 1024;

/** Keys whose objects are small and should stay inline in the summary view. */
export const PRESERVE_KEYS = new Set(['calibration', 'summary', 'bestValues']);

/** Small metadata arrays that should never be truncated. */
export const SKIP_TRUNCATE_KEYS = new Set(['models', 'failedModels']);

/** Fields preserved from each `bestValues.*` entry — the signal-bearing
 *  keys an AI needs to understand a scanner mispricing hit. Drops verbose
 *  raw pricing (marketBid/ask, modelPrice, errorMetrics, qualityFlags). */
const BEST_VALUE_KEEP_KEYS = new Set([
  'type', 'strike', 'signal', 'edge',
  'priceDiff', 'priceDiffPct', 'marketMid',
  'moneyness', 'volume', 'openInterest', 'expiration',
]);

/** Summary fields to drop (non-signal noise). */
const SUMMARY_DROP_KEYS = new Set(['scanTimeMs']);

/** Primary greeks kept in the compact view — higher-order greeks
 *  (Vanna, Charm, Veta, Speed, Zomma, Color, Ultima, etc.) are dropped. */
const PRIMARY_GREEKS = new Set(['Delta', 'Gamma', 'Theta', 'Vega', 'Rho']);

function compactGreeks(greeks: unknown): unknown {
  if (!greeks || typeof greeks !== 'object' || Array.isArray(greeks)) return greeks;
  const src = greeks as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of PRIMARY_GREEKS) {
    if (key in src) out[key] = src[key];
  }
  return out;
}

function compactBestValueEntry(entry: unknown): unknown {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
  const src = entry as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of BEST_VALUE_KEEP_KEYS) {
    if (key in src) out[key] = src[key];
  }
  return out;
}

function compactBestValues(bestValues: unknown): unknown {
  if (!bestValues || typeof bestValues !== 'object' || Array.isArray(bestValues)) return bestValues;
  return Object.fromEntries(
    Object.entries(bestValues as Record<string, unknown>)
      .map(([k, v]) => [k, compactBestValueEntry(v)]),
  );
}

function compactSummary(summary: unknown): unknown {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return summary;
  return Object.fromEntries(
    Object.entries(summary as Record<string, unknown>)
      .filter(([k]) => !SUMMARY_DROP_KEYS.has(k)),
  );
}

/** Compact `positions[].models[]` entries: keep model name, price, and
 *  primary greeks only. Drop higher-order greeks and diagnostic blobs. */
function compactPositions(positions: unknown): unknown {
  if (!Array.isArray(positions)) return positions;
  return positions.map((pos) => {
    if (!pos || typeof pos !== 'object' || Array.isArray(pos)) return pos;
    const src = pos as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(src)) {
      if (k === 'models' && Array.isArray(v)) {
        out[k] = v.map((m) => {
          if (!m || typeof m !== 'object' || Array.isArray(m)) return m;
          const modelSrc = m as Record<string, unknown>;
          const modelOut: Record<string, unknown> = {};
          if ('model' in modelSrc) modelOut.model = modelSrc.model;
          if ('price' in modelSrc) modelOut.price = modelSrc.price;
          // Signal-bearing fields an AI needs to understand model disagreement
          // — cheap to keep (~5 bytes/field) and core to the tool's purpose.
          if ('signal' in modelSrc) modelOut.signal = modelSrc.signal;
          if ('priceDiffPct' in modelSrc) modelOut.priceDiffPct = modelSrc.priceDiffPct;
          if ('greeks' in modelSrc) modelOut.greeks = compactGreeks(modelSrc.greeks);
          if ('error' in modelSrc && modelSrc.error) modelOut.error = modelSrc.error;
          return modelOut;
        });
      } else if (k === 'greeks') {
        out[k] = compactGreeks(v);
      } else {
        out[k] = v;
      }
    }
    return out;
  });
}

/** Replace nested objects with placeholders.
 *  Preserves arrays, scalars, and whitelisted keys. For the whitelisted
 *  `summary`, `bestValues`, and `positions` keys, applies targeted
 *  compaction so the AI sees signal fields without verbose raw pricing. */
export function flattenObjects(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => {
      if (k === 'summary') return [k, compactSummary(v)];
      if (k === 'bestValues') return [k, compactBestValues(v)];
      if (k === 'positions') return [k, compactPositions(v)];
      if (PRESERVE_KEYS.has(k)) return [k, v];
      if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
        return [k, '[nested object]'];
      }
      return [k, v];
    })
  );
}

/** Pick the most informative entries from a comparison array.
 *  Prioritises unanimous/majority agreement, strongest per-model divergence,
 *  and proximity to ATM — so the preview surfaces actionable signals,
 *  not deep-wing noise. */
export function pickBestComparisons(arr: any[], maxItems: number, spot?: number): any[] {
  const scored = arr.map((item, idx) => {
    let score = 0;
    // Agreement tier (dominant factor)
    const agr = item.agreement as string | undefined;
    if (agr?.startsWith('unanimous')) score += 200;
    else if (agr?.startsWith('majority')) score += 100;
    // Max absolute per-model divergence (stronger signal = more interesting)
    const diffs = item.modelDiffs as Record<string, number> | undefined;
    if (diffs) {
      const maxDiff = Math.max(...Object.values(diffs).map(d => Math.abs(d)));
      score += Math.min(maxDiff, 50);
    }
    // Price spread across models (high dispersion = worth investigating)
    const spread = item.priceSpread as number | null;
    const mid = item.marketMid as number | null;
    if (spread != null && mid != null && mid > 0) {
      score += Math.min((spread / mid) * 100, 30);
    }
    // ATM proximity tiebreaker — prefer strikes near spot
    if (item.moneyness === 'ATM') {
      score += 20;
    } else if (spot != null && spot > 0) {
      const strike = item.strike as number | undefined;
      if (strike != null) {
        const distPct = Math.abs(strike - spot) / spot;
        score += Math.max(0, 15 - distPct * 100);
      }
    }
    return { idx, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxItems).map(s => arr[s.idx]);
}

/** Truncate large arrays in-place, replacing with count + preview.
 *  Skips small metadata arrays. Uses signal-aware selection for comparisons. */
export function truncateArrays(obj: Record<string, unknown>, maxItems = 5, spot?: number): void {
  for (const [k, v] of Object.entries(obj)) {
    if (!Array.isArray(v) || v.length <= maxItems || SKIP_TRUNCATE_KEYS.has(k)) continue;
    const isComparison = k === 'comparison' && v.length > 0 && v[0]?.agreement !== undefined;
    const preview = isComparison ? pickBestComparisons(v, maxItems, spot) : v.slice(0, maxItems);
    obj[k] = {
      _count: v.length,
      _preview: preview,
      _meta: {
        showing: maxItems,
        total: v.length,
        truncated: true,
        ...(isComparison ? { selection: 'strongest_signals' } : {}),
      },
    };
  }
}

/** Shape a single FFT record for the default (non-full) summary view. */
export function shapeRecord(record: any): void {
  if (record.data && typeof record.data === 'object') {
    record.data = flattenObjects(record.data);
  }
  if (record.details && typeof record.details === 'object') {
    record.details = flattenObjects(record.details);
  }
}

/** Apply array truncation to a record if needed. */
export function truncateRecord(record: any): void {
  const spot = typeof record.data?.spot === 'number' ? record.data.spot : undefined;
  if (record.data && typeof record.data === 'object') truncateArrays(record.data);
  if (record.details && typeof record.details === 'object') truncateArrays(record.details, 5, spot);
}

/** Drop oldest records in-place until the response fits under a byte budget.
 *
 *  Called by the FFT tool as a Pass-3 fallback after `shapeRecord` (Pass 1)
 *  and `truncateRecord` (Pass 2). Sync-backed FFT data is sorted newest-first
 *  (`timestamp DESC` in `proxy/routes/sync.ts`), so `pop()` drops the oldest.
 *  Preserves at least 1 record and annotates the response with
 *  `_truncation_meta` so AI clients see exactly how many they got vs requested.
 *  Returns the mutated response for chaining. No-op when already under budget.
 */
export function trimToSizeBudget(
  res: { data: unknown[]; count?: number; _truncation_meta?: Record<string, unknown>; [k: string]: unknown } | null | undefined,
  budget = FFT_SAFE_SIZE_BUDGET,
): void {
  if (!res || !Array.isArray(res.data) || res.data.length <= 1) return;
  if (JSON.stringify(res).length <= budget) return;

  const requested = res.data.length;
  while (res.data.length > 1 && JSON.stringify(res).length > budget) {
    res.data.pop();
  }
  res.count = res.data.length;
  res._truncation_meta = {
    returned: res.data.length,
    requested,
    selection: 'newest',
    reason: 'size_budget',
  };
}
