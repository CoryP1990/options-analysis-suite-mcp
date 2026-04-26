type RawComputeRunRecord = {
  [key: string]: unknown;
  run_key?: unknown;
  scope?: unknown;
  quality?: unknown;
  status?: unknown;
  timestamp?: unknown;
  data?: unknown;
  positions?: unknown;
};

type ComputeRunFilters = {
  runKey?: string;
  status?: string;
  scope?: string;
  quality?: string;
  underlying?: string;
};

const MAX_DEFAULT_POSITIONS = 5;
const MAX_MULTI_RUN_POSITIONS = 3;
const MAX_DEFAULT_ERRORS = 5;
const MAX_MULTI_RUN_MODELS = 5;
const MAX_SINGLE_RUN_FALLBACK_POSITIONS = 3;
const MAX_SINGLE_RUN_FALLBACK_MODELS = 5;
const MAX_SINGLE_RUN_EMERGENCY_POSITIONS = 1;
const MAX_SINGLE_RUN_EMERGENCY_MODELS = 3;
const BUDGET_DISPERSION_KEYS = new Set(['Price', 'Delta', 'Gamma', 'Theta', 'Vega', 'Rho', 'Vanna', 'Charm', 'Vomma', 'Veta']);
/** Headroom under the 50 KB MCP response limit so the generic size guard
 *  never silently collapses the response. Mirrors fftResponseShaping. */
const COMPUTE_RUNS_SAFE_SIZE_BUDGET = 48 * 1024;

function getObject(value: unknown): Record<string, unknown> | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function getArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function round(value: unknown, decimals = 4): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Number(value.toFixed(decimals));
}

function asTimestamp(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function toIso(timestamp: unknown): string | undefined {
  const ts = asTimestamp(timestamp);
  if (ts == null || ts <= 0) return undefined;
  return new Date(ts).toISOString();
}

function normalizeUnderlying(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim().toUpperCase() : undefined;
}

function getPositions(record: Record<string, unknown>): Record<string, unknown>[] {
  const topLevel = getArray<Record<string, unknown>>(record.positions)
    .filter((item) => item != null && typeof item === 'object' && !Array.isArray(item));
  if (topLevel.length > 0) return topLevel;

  const nested = getObject(record.data);
  return getArray<Record<string, unknown>>(nested?.positions)
    .filter((item) => item != null && typeof item === 'object' && !Array.isArray(item));
}

function getSummary(record: Record<string, unknown>): Record<string, unknown> | null {
  return getObject(getObject(record.data)?.summary);
}

function getDispersion(record: Record<string, unknown>): Record<string, unknown> | null {
  return getObject(getObject(getObject(record.data)?.portfolioAggregates)?.dispersion);
}

function getDispersionExclusions(record: Record<string, unknown>): Record<string, unknown> | null {
  return getObject(getObject(getObject(record.data)?.portfolioAggregates)?.excluded);
}

function compactMetricValue(value: unknown): number | Record<string, unknown> | undefined {
  if (typeof value === 'number') return round(value, 6);

  const asObj = getObject(value);
  if (!asObj || typeof asObj.value !== 'number') return undefined;

  const next: Record<string, unknown> = {};
  if (typeof asObj.stdError === 'number') next.stdError = round(asObj.stdError, 6);
  if (typeof asObj.ciLow === 'number') next.ciLow = round(asObj.ciLow, 6);
  if (typeof asObj.ciHigh === 'number') next.ciHigh = round(asObj.ciHigh, 6);
  if (Object.keys(next).length === 0) return round(asObj.value, 6);
  next.value = round(asObj.value, 6);
  return next;
}

function compactGreekMap(value: unknown): Record<string, unknown> | undefined {
  const source = getObject(value);
  if (!source) return undefined;

  const compact = Object.fromEntries(
    Object.entries(source)
      .map(([greek, greekValue]) => [greek, compactMetricValue(greekValue)])
      .filter(([, greekValue]) => greekValue !== undefined),
  );

  return Object.keys(compact).length > 0 ? compact : undefined;
}

function compactCalibrationParams(value: unknown): Record<string, unknown> | undefined {
  const params = getObject(value);
  if (!params) return undefined;

  const compact = Object.fromEntries(
    Object.entries(params)
      .filter(([, paramValue]) => (
        paramValue == null
        || typeof paramValue === 'string'
        || typeof paramValue === 'boolean'
        || (typeof paramValue === 'number' && Number.isFinite(paramValue))
      ))
      .map(([key, paramValue]) => [
        key,
        typeof paramValue === 'number' ? round(paramValue, 6) : paramValue,
      ]),
  );

  return Object.keys(compact).length > 0 ? compact : undefined;
}

function shapeCalibrationSummary(value: unknown): Record<string, unknown> | undefined {
  const calibration = getObject(value);
  if (!calibration) return undefined;

  return {
    rmse: round(calibration.rmse, 6),
    confidence: round(calibration.confidence, 4),
    // Replace the camelCase `isFallback` boolean with the single-word `fallback`,
    // emitted only when the calibration actually fell back to defaults. Reads as
    // prose ("the model is in fallback") instead of a code identifier.
    ...(calibration.isFallback === true ? { fallback: true } : {}),
    expirationDate: typeof calibration.expirationDate === 'string' ? calibration.expirationDate : undefined,
    executionPath: typeof calibration.executionPath === 'string' ? calibration.executionPath : undefined,
    params: compactCalibrationParams(calibration.params),
    warnings: getArray<string>(calibration.warnings).filter((warning) => typeof warning === 'string').slice(0, 5),
  };
}

/** Rename camelCase wall/flip/tilt keys to space-separated equivalents so the
 *  LLM doesn't surface backend identifiers (callWall, gammaTilt, etc.) verbatim
 *  in user-facing summaries. */
function shapeKeyLevels(value: unknown): Record<string, unknown> | undefined {
  const levels = getObject(value);
  if (!levels) return undefined;
  const KEY_MAP: Record<string, string> = {
    callWall: 'call wall',
    putWall: 'put wall',
    gammaFlip: 'gamma flip',
    gammaTilt: 'gamma tilt',
    secondaryFlips: 'secondary flips',
  };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(levels)) {
    out[KEY_MAP[k] ?? k] = v;
  }
  return out;
}

/** Sanitize raw/full compute-run payloads at the MCP boundary. Full mode still
 *  returns the raw row structure, but backend identifiers that LLMs repeat as
 *  prose (`isFallback`, `callWall`, `gammaFlip`, etc.) are rewritten first. */
export function sanitizeComputeRunsWireOutput(value: unknown, depth = 0): void {
  if (depth > 12 || value == null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) sanitizeComputeRunsWireOutput(item, depth + 1);
    return;
  }

  const obj = value as Record<string, unknown>;
  if ('keyLevels' in obj) {
    const shaped = shapeKeyLevels(obj.keyLevels);
    if (shaped) obj.keyLevels = shaped;
  }
  if ('isFallback' in obj) {
    const fallback = obj.isFallback === true;
    delete obj.isFallback;
    if (fallback) obj.fallback = true;
  }

  for (const child of Object.values(obj)) {
    if (child != null && typeof child === 'object') {
      sanitizeComputeRunsWireOutput(child, depth + 1);
    }
  }
}

function getVariantPriority(value: unknown): number {
  const variant = getObject(value);
  if (!variant) return 0;

  let score = 0;
  const error = typeof variant.error === 'string' ? variant.error.trim() : '';
  if (!error) score += 100;

  const dimensions = getObject(variant.dimensions);
  if (dimensions?.exerciseStyle === 'european') score += 40;

  const beta = typeof dimensions?.beta === 'number' ? dimensions.beta : undefined;
  if (beta == null) {
    score += 20;
  } else {
    score += Math.max(0, 20 - Math.abs(beta - 1) * 20);
  }

  return score;
}

function getLegacyVariants(model: Record<string, unknown>): Record<string, unknown>[] {
  return getArray<Record<string, unknown>>(model.variants)
    .filter((variant) => variant != null && typeof variant === 'object' && !Array.isArray(variant))
    .sort((left, right) => getVariantPriority(right) - getVariantPriority(left));
}

function shapeRepresentativeSummary(value: unknown): Record<string, unknown> | undefined {
  const representative = getObject(value);
  if (!representative) return undefined;

  const summary: Record<string, unknown> = {
    price: compactMetricValue(representative.price),
    greeks: compactGreekMap(representative.greeks),
    dimensions: getObject(representative.dimensions) ?? undefined,
  };

  if (typeof representative.error === 'string' && representative.error.length > 0) {
    summary.error = representative.error;
  }
  if (representative.diagnostics && getObject(representative.diagnostics)) {
    summary.diagnostics = representative.diagnostics;
  }

  return Object.fromEntries(
    Object.entries(summary).filter(([, fieldValue]) => fieldValue !== undefined),
  );
}

function shapeModelSummary(value: unknown): Record<string, unknown> | undefined {
  const model = getObject(value);
  if (!model) return undefined;

  const legacyVariants = getLegacyVariants(model);
  const representative = shapeRepresentativeSummary(model.representative ?? legacyVariants[0]);
  const alternateCount = Array.isArray(model.alternates) ? model.alternates.length : Math.max(0, legacyVariants.length - (representative ? 1 : 0));
  const variantCount = typeof model.variantCount === 'number'
    ? model.variantCount
    : legacyVariants.length > 0
      ? legacyVariants.length
      : alternateCount + (representative ? 1 : 0);
  const summary: Record<string, unknown> = {
    variantCount: variantCount > 0 ? variantCount : undefined,
    alternateCount,
  };

  if (representative) {
    summary.price = representative.price;
    summary.greeks = representative.greeks;
    summary.dimensions = representative.dimensions;
    summary.error = representative.error;
    summary.diagnostics = representative.diagnostics;
  }

  const calibration = shapeCalibrationSummary(model.calibration);
  if (calibration) summary.calibrationSummary = calibration;

  if (model.earlyExercisePremium && getObject(model.earlyExercisePremium)) {
    summary.earlyExercisePremium = model.earlyExercisePremium;
  }

  return Object.fromEntries(
    Object.entries(summary).filter(([, fieldValue]) => fieldValue !== undefined),
  );
}

function getModelPriority(modelName: string, modelValue: Record<string, unknown>): number {
  let score = 0;
  const calibration = getObject(modelValue.calibrationSummary);
  const price = modelValue.price;
  const greeks = getObject(modelValue.greeks);

  // Non-fallback calibration: the `fallback` field is absent (we only emit it
  // when isFallback === true), so absence here means a real calibration ran.
  if (calibration && calibration.fallback !== true) score += 100;
  if (price !== undefined) score += 40;
  if (greeks && Object.keys(greeks).length > 0) score += 20;

  const preferredOrder = [
    'BlackScholes',
    'Heston',
    'SABR',
    'JumpDiffusion',
    'VarianceGamma',
    'FFT',
    'PDE',
    'Binomial',
  ];
  const preferredIndex = preferredOrder.indexOf(modelName);
  if (preferredIndex !== -1) score += 15 - preferredIndex;

  const variantCount = typeof modelValue.variantCount === 'number' ? modelValue.variantCount : 0;
  score += Math.min(variantCount, 10);

  return score;
}

function getPositionSortValue(position: Record<string, unknown>): number {
  const marketPrice = typeof position.marketPrice === 'number' ? Math.abs(position.marketPrice) : 0;
  const quantity = typeof position.quantity === 'number' ? Math.abs(position.quantity) : 0;
  const multiplier = typeof position.multiplier === 'number' ? Math.abs(position.multiplier) : 1;
  return marketPrice * quantity * multiplier;
}

function shapePosition(position: Record<string, unknown>, maxModels?: number): Record<string, unknown> {
  const models = getObject(position.models) ?? {};
  const allShapedModels = Object.fromEntries(
    Object.entries(models)
      .map(([modelName, modelValue]) => [modelName, shapeModelSummary(modelValue)])
      .filter(([, modelValue]) => modelValue != null),
  );
  const shapedModelEntries = Object.entries(allShapedModels);
  const limitedModelEntries = typeof maxModels === 'number' && maxModels > 0 && shapedModelEntries.length > maxModels
    ? [...shapedModelEntries]
        .sort((left, right) => getModelPriority(right[0], right[1] as Record<string, unknown>) - getModelPriority(left[0], left[1] as Record<string, unknown>))
        .slice(0, maxModels)
    : shapedModelEntries;
  const shapedModels = Object.fromEntries(limitedModelEntries);

  const calibratedModels = Object.entries(shapedModels)
    .filter(([, modelValue]) => getObject(modelValue)?.calibrationSummary && getObject(getObject(modelValue)?.calibrationSummary)?.fallback !== true)
    .map(([modelName]) => modelName);
  const symbol = typeof position.symbol === 'string' && position.symbol.trim().length > 0
    ? position.symbol
    : normalizeUnderlying(position.underlying);

  return {
    positionId: typeof position.positionId === 'string' ? position.positionId : undefined,
    symbol,
    underlying: normalizeUnderlying(position.underlying),
    isCall: typeof position.isCall === 'boolean' ? position.isCall : undefined,
    strike: round(position.strike, 4),
    expiration: typeof position.expiration === 'string' ? position.expiration : undefined,
    daysToExpiry: typeof position.daysToExpiry === 'number' ? position.daysToExpiry : undefined,
    spot: round(position.spot, 4),
    iv: round(position.iv, 6),
    quantity: typeof position.quantity === 'number' ? position.quantity : undefined,
    multiplier: typeof position.multiplier === 'number' ? position.multiplier : undefined,
    marketPrice: round(position.marketPrice, 6),
    riskFreeRate: round(position.riskFreeRate, 6),
    dividendYield: round(position.dividendYield, 6),
    modelCount: shapedModelEntries.length,
    calibratedModels,
    models: shapedModels,
    omittedModelCount: Math.max(0, shapedModelEntries.length - limitedModelEntries.length),
  };
}

function shapeExposureSweep(value: unknown): Array<Record<string, unknown>> | undefined {
  const sweep = getArray<Record<string, unknown>>(value)
    .filter((entry) => entry != null && typeof entry === 'object' && !Array.isArray(entry))
    .map((entry) => ({
      underlying: normalizeUnderlying(entry.underlying),
      spot: round(entry.spot, 4),
      strikeCount: typeof entry.strikeCount === 'number' ? entry.strikeCount : undefined,
      keyLevels: shapeKeyLevels(entry.keyLevels),
      timestamp: asTimestamp(entry.timestamp),
      at: toIso(entry.timestamp),
    }));

  return sweep.length > 0 ? sweep : undefined;
}

function shapeDispersion(value: Record<string, unknown> | null): Record<string, unknown> | undefined {
  if (!value) return undefined;

  const shaped = Object.fromEntries(
    Object.entries(value).map(([greek, greekValue]) => {
      const dispersion = getObject(greekValue);
      if (!dispersion) return [greek, greekValue];
      return [greek, {
        min: round(dispersion.min, 4),
        max: round(dispersion.max, 4),
        mean: round(dispersion.mean, 4),
        stddev: round(dispersion.stddev, 4),
        models: getArray<string>(dispersion.models).filter((item) => typeof item === 'string'),
      }];
    }),
  );

  return Object.keys(shaped).length > 0 ? shaped : undefined;
}

function shapeDispersionExclusions(value: Record<string, unknown> | null): Record<string, unknown> | undefined {
  if (!value) return undefined;
  const models = getArray<string>(value.models).filter((item) => typeof item === 'string');
  if (models.length === 0) return undefined;
  return { models };
}

function limitPositionModels(position: Record<string, unknown>, maxModels: number): Record<string, unknown> {
  const models = getObject(position.models);
  if (!models) return position;

  const entries = Object.entries(models);
  if (entries.length <= maxModels) return position;

  return {
    ...position,
    models: Object.fromEntries(entries.slice(0, maxModels)),
    omittedModelCount: (typeof position.omittedModelCount === 'number' ? position.omittedModelCount : 0) + entries.length - maxModels,
  };
}

function limitRunPositionsAndModels(run: Record<string, unknown>, maxPositions: number, maxModels: number): Record<string, unknown> {
  const positions = getArray<Record<string, unknown>>(run.positions);
  if (positions.length === 0) return run;

  return {
    ...run,
    positions: positions
      .slice(0, maxPositions)
      .map((position) => limitPositionModels(position, maxModels)),
    omittedPositionCount: (typeof run.omittedPositionCount === 'number' ? run.omittedPositionCount : 0) + Math.max(0, positions.length - maxPositions),
  };
}

function compactPortfolioDispersionForBudget(run: Record<string, unknown>): Record<string, unknown> {
  const dispersion = getObject(run.portfolioDispersion);
  if (!dispersion) return run;

  const compact = Object.fromEntries(
    Object.entries(dispersion)
      .filter(([greek]) => BUDGET_DISPERSION_KEYS.has(greek))
      .map(([greek, value]) => {
        const metric = getObject(value);
        if (!metric) return [greek, value];
        const { models: _models, ...withoutModels } = metric;
        return [greek, withoutModels];
      }),
  );

  return {
    ...run,
    portfolioDispersion: compact,
    _portfolioDispersion_meta: {
      modelsOmitted: true,
      kept: Object.keys(compact),
    },
  };
}

function buildComputeRunsOutput(response: Record<string, unknown>, shapedRuns: Array<Record<string, unknown>>): Record<string, unknown> {
  const statuses = Array.from(new Set(
    shapedRuns.map((record) => record.status).filter((status): status is string => typeof status === 'string' && status.length > 0),
  ));
  const scopes = Array.from(new Set(
    shapedRuns.map((record) => record.scope).filter((scope): scope is string => typeof scope === 'string' && scope.length > 0),
  ));
  const qualities = Array.from(new Set(
    shapedRuns.map((record) => record.quality).filter((quality): quality is string => typeof quality === 'string' && quality.length > 0),
  ));
  const underlyings = Array.from(new Set(
    shapedRuns.flatMap((record) => getArray<string>(record.underlyings)).filter((value) => typeof value === 'string' && value.length > 0),
  ));
  const latest = shapedRuns[0];

  return {
    ...response,
    data: shapedRuns,
    summary: {
      returnedRuns: shapedRuns.length,
      latestRunKey: typeof latest?.runKey === 'string' ? latest.runKey : undefined,
      latestStatus: typeof latest?.status === 'string' ? latest.status : undefined,
      latestStartedAt: typeof latest?.startedAt === 'string' ? latest.startedAt : undefined,
      statuses,
      scopes,
      qualities,
      underlyings,
    },
  };
}

function trimComputeRunsToBudget(out: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(out.data) || JSON.stringify(out).length <= COMPUTE_RUNS_SAFE_SIZE_BUDGET) return out;

  const requested = out.data.length;
  while (out.data.length > 1 && JSON.stringify(out).length > COMPUTE_RUNS_SAFE_SIZE_BUDGET) {
    out.data.pop();
  }

  if (out.data.length === 1 && JSON.stringify(out).length > COMPUTE_RUNS_SAFE_SIZE_BUDGET) {
    out.data[0] = limitRunPositionsAndModels(out.data[0] as Record<string, unknown>, MAX_SINGLE_RUN_FALLBACK_POSITIONS, MAX_SINGLE_RUN_FALLBACK_MODELS);
  }
  if (out.data.length === 1 && JSON.stringify(out).length > COMPUTE_RUNS_SAFE_SIZE_BUDGET) {
    out.data[0] = compactPortfolioDispersionForBudget(out.data[0] as Record<string, unknown>);
  }
  if (out.data.length === 1 && JSON.stringify(out).length > COMPUTE_RUNS_SAFE_SIZE_BUDGET) {
    out.data[0] = limitRunPositionsAndModels(out.data[0] as Record<string, unknown>, MAX_SINGLE_RUN_EMERGENCY_POSITIONS, MAX_SINGLE_RUN_EMERGENCY_MODELS);
  }
  if (out.data.length === 1 && JSON.stringify(out).length > COMPUTE_RUNS_SAFE_SIZE_BUDGET) {
    const run = out.data[0] as Record<string, unknown>;
    const positions = getArray(run.positions);
    delete run.positions;
    run._positions_meta = { omitted: true, omittedCount: positions.length, reason: 'size budget' };
  }
  if (out.data.length === 1 && JSON.stringify(out).length > COMPUTE_RUNS_SAFE_SIZE_BUDGET) {
    const run = out.data[0] as Record<string, unknown>;
    delete run.portfolioDispersion;
    run._portfolioDispersion_meta = { omitted: true, reason: 'size budget' };
  }

  out.count = out.data.length;
  const summary = getObject(out.summary);
  if (summary) summary.returnedRuns = out.data.length;
  out._truncation_meta = {
    returned: out.data.length,
    requested,
    selection: 'newest',
    reason: 'size budget',
  };

  return out;
}

export function shapeComputeRunRecord(
  record: unknown,
  maxPositions = MAX_DEFAULT_POSITIONS,
  maxModels?: number,
): Record<string, unknown> | unknown {
  const raw = getObject(record);
  if (!raw) return record;

  const summary = getSummary(raw) ?? {};
  const positions = getPositions(raw);
  const sortedPositions = [...positions].sort((left, right) => getPositionSortValue(right) - getPositionSortValue(left));
  const shownPositions = sortedPositions.slice(0, maxPositions);
  const underlyings = Array.from(new Set(
    positions
      .map((position) => normalizeUnderlying(position.underlying))
      .filter((value): value is string => Boolean(value)),
  ));

  return {
    runKey: typeof raw.run_key === 'string' ? raw.run_key : typeof raw.runKey === 'string' ? raw.runKey : undefined,
    status: typeof raw.status === 'string' ? raw.status : undefined,
    scope: typeof raw.scope === 'string' ? raw.scope : undefined,
    quality: typeof raw.quality === 'string' ? raw.quality : undefined,
    timestamp: asTimestamp(raw.timestamp),
    startedAt: toIso(raw.timestamp),
    completedAt: toIso(summary.completedAt),
    summary: {
      totalPositions: typeof summary.totalPositions === 'number' ? summary.totalPositions : positions.length,
      totalModelRuns: typeof summary.totalModelRuns === 'number' ? summary.totalModelRuns : undefined,
      totalCalibrations: typeof summary.totalCalibrations === 'number' ? summary.totalCalibrations : undefined,
      executionTimeMs: round(summary.executionTimeMs, 2),
      errorCount: typeof summary.errorCount === 'number' ? summary.errorCount : undefined,
      engineVersion: typeof summary.engineVersion === 'string' ? summary.engineVersion : undefined,
      portfolioSnapshotId: typeof summary.portfolioSnapshotId === 'number' ? summary.portfolioSnapshotId : undefined,
      riskSnapshotId: typeof summary.riskSnapshotId === 'number' ? summary.riskSnapshotId : undefined,
    },
    underlyings,
    portfolioDispersion: shapeDispersion(getDispersion(raw)),
    dispersionExclusions: shapeDispersionExclusions(getDispersionExclusions(raw)),
    exposureSweep: shapeExposureSweep(getObject(raw.data)?.exposureSweep),
    errors: getArray<Record<string, unknown>>(getObject(raw.data)?.errors).slice(0, MAX_DEFAULT_ERRORS),
    positions: shownPositions.map((position) => shapePosition(position, maxModels)),
    omittedPositionCount: Math.max(0, positions.length - shownPositions.length),
  };
}

export function recordMatchesComputeFilters(record: unknown, filters: ComputeRunFilters): boolean {
  const raw = getObject(record);
  if (!raw) return false;

  if (filters.runKey) {
    const runKey = typeof raw.run_key === 'string' ? raw.run_key : typeof raw.runKey === 'string' ? raw.runKey : '';
    if (runKey !== filters.runKey) return false;
  }
  if (filters.status && raw.status !== filters.status) return false;
  if (filters.scope && raw.scope !== filters.scope) return false;
  if (filters.quality && raw.quality !== filters.quality) return false;
  if (filters.underlying) {
    const target = filters.underlying.trim().toUpperCase();
    const matchesUnderlying = getPositions(raw).some((position) => normalizeUnderlying(position.underlying) === target);
    if (!matchesUnderlying) return false;
  }
  return true;
}

export function summarizeComputeRunsResponse(payload: unknown): unknown {
  const response = getObject(payload);
  if (!response || !Array.isArray(response.data)) return payload;
  // Apply per-position model AND positions trimming as soon as more than one
  // run is requested. The previous setup left limit=2/3 unbounded on positions
  // and only trimmed models at limit>=4; on rich-data accounts this blew the
  // 50 KB MCP budget. Cap to 3 positions × 5 models per multi-run record.
  const isMultiRun = response.data.length >= 2;
  const maxModelsPerPosition = isMultiRun ? MAX_MULTI_RUN_MODELS : undefined;
  const maxPositionsPerRun = isMultiRun ? MAX_MULTI_RUN_POSITIONS : MAX_DEFAULT_POSITIONS;

  const shapedRuns = response.data
    .map((record) => shapeComputeRunRecord(record, maxPositionsPerRun, maxModelsPerPosition))
    .filter((record): record is Record<string, unknown> => record != null && typeof record === 'object' && !Array.isArray(record));

  return trimComputeRunsToBudget(buildComputeRunsOutput(response, shapedRuns));
}
