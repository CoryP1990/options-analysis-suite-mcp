/**
 * FFT Response Shaping
 *
 * Pure functions for trimming FFT scan results to fit the MCP 50 KB
 * response budget while preserving the most useful signal data.
 */

/** Byte threshold at which we start truncating arrays.
 *  Below the 50 KB hard limit in helpers.ts to leave headroom. */
export const TRUNCATION_THRESHOLD = 40 * 1024;

/** Keys whose objects are small and should stay inline in the summary view. */
export const PRESERVE_KEYS = new Set(['calibration', 'summary', 'bestValues']);

/** Small metadata arrays that should never be truncated. */
export const SKIP_TRUNCATE_KEYS = new Set(['models', 'failedModels']);

/** Replace nested objects with placeholders.
 *  Preserves arrays, scalars, and whitelisted keys. */
export function flattenObjects(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => {
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
      _note: `Showing ${maxItems} of ${v.length}${isComparison ? ' (strongest signals)' : ''}. Use full=true for complete data.`,
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
