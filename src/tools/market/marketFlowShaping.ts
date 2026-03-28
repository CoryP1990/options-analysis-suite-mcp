type MostActiveContract = {
  [key: string]: unknown;
  symbol?: string;
  underlying?: string;
  type?: string;
  strike?: number;
  expiration?: string;
  volume?: number;
  openInterest?: number;
  iv?: number;
  volumeOIRatio?: number;
  delta?: number;
  bid?: number;
  ask?: number;
  last?: number;
  index?: string | null;
};

type MostActiveTicker = {
  [key: string]: unknown;
  symbol?: string;
  index?: string | null;
  spotPrice?: number;
  expiration?: string | null;
  totalCallVolume?: number;
  totalPutVolume?: number;
  totalVolume?: number;
  totalCallOI?: number;
  totalPutOI?: number;
  totalOI?: number;
  putCallRatio?: number | null;
  atmIV?: number | null;
  avgVolumeOIRatio?: number;
};

type MostActivePayload = {
  [key: string]: unknown;
  type?: string;
  data?: unknown;
  index?: string;
  timestamp?: string;
};

type RankedContract = {
  contract: MostActiveContract;
  score: number;
  volume: number;
};

const DEFAULT_CONTRACT_DISPLAY_LIMIT = 10;
const MAX_CONTRACTS_PER_UNDERLYING = 2;
const MIN_STRONG_CONTRACTS_WITHOUT_WEAK_FALLBACK = 5;

type ShortVolumeRow = {
  [key: string]: unknown;
  date?: string;
  shortVolume?: number;
  shortInterest?: number;
  totalVolume?: number;
  shortPercent?: number | string | null;
  shortPercentage?: number | string | null;
  shortInterestPercentFloat?: number | string | null;
  shortExemptVolume?: number;
  markets?: string | string[];
};

type ShortVolumePayload = {
  [key: string]: unknown;
  symbol?: string;
  lastUpdate?: string;
  latest?: unknown;
  history?: unknown;
  averages?: unknown;
  yearStats?: unknown;
};

type ShortInterestRow = {
  [key: string]: unknown;
  settlementDate?: string;
  shortInterest?: number;
  previousShortInterest?: number;
  changeNumber?: number;
  changePercent?: number;
  avgDailyVolume?: number;
  daysToCover?: number;
  shortPercentOfFloat?: number | null;
};

type ShortInterestPayload = {
  [key: string]: unknown;
  symbol?: string;
  lastUpdate?: string;
  freeFloat?: number | null;
  sharesOutstanding?: number | null;
  latest?: unknown;
  history?: unknown;
  stats?: unknown;
};

type ShareFloatFallback = {
  freeFloat: number | null;
  sharesOutstanding: number | null;
};

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asPercentNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number.parseFloat(trimmed.replace(/%/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function roundTo(value: number | null, digits = 2): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function normalizeMarkets(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map((item) => item.trim());
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function asArrayOfObjects<T extends Record<string, unknown>>(value: unknown): T[] {
  return Array.isArray(value)
    ? value.filter((item): item is T => item != null && typeof item === 'object')
    : [];
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseTimestampMs(value: unknown): number | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function expirationDays(contract: MostActiveContract, referenceMs: number | null): number | null {
  if (referenceMs == null || typeof contract.expiration !== 'string' || !contract.expiration.trim()) return null;
  const parsed = Date.parse(`${contract.expiration}T00:00:00Z`);
  if (!Number.isFinite(parsed)) return null;
  return (parsed - referenceMs) / 86400000;
}

function contractDisplayPrice(contract: MostActiveContract): number | null {
  const bid = asFiniteNumber(contract.bid);
  const ask = asFiniteNumber(contract.ask);
  if (bid != null && ask != null && bid >= 0 && ask >= 0) {
    return (bid + ask) / 2;
  }
  return asFiniteNumber(contract.last);
}

function scoreContractForDefaultView(contract: MostActiveContract, referenceMs: number | null): number {
  const volume = asFiniteNumber(contract.volume) ?? 0;
  const openInterest = asFiniteNumber(contract.openInterest) ?? 0;
  const volumeOIRatio = asFiniteNumber(contract.volumeOIRatio) ?? 0;

  let score = Math.log10(volume + 1) * 18
    + Math.log10(openInterest + 1) * 6
    + Math.min(volumeOIRatio, 20) * 2;

  const absDelta = Math.abs(asFiniteNumber(contract.delta) ?? Number.NaN);
  if (Number.isFinite(absDelta)) {
    if (absDelta < 0.05 || absDelta > 0.95) score -= 28;
    else if (absDelta < 0.15 || absDelta > 0.85) score -= 16;
    else if (absDelta >= 0.25 && absDelta <= 0.75) score += 8;
    else score += 3;
  }

  const price = contractDisplayPrice(contract);
  if (price != null) {
    if (price < 0.05) score -= 60;
    else if (price < 0.15) score -= 35;
    else if (price < 0.5) score -= 15;
    else if (price < 1) score -= 6;
    else score += Math.min(Math.log10(price + 1) * 3, 5);
  }

  const dte = expirationDays(contract, referenceMs);
  if (dte != null) {
    if (dte > 365) score -= 110;
    else if (dte > 180) score -= 90;
    else if (dte > 120) score -= 55;
    else if (dte > 60) score -= 18;
    else if (dte >= 1 && dte <= 30) score += 8;
    else if (dte > 30 && dte <= 45) score += 4;
    else if (dte === 0) score += 2;
  }

  if (volumeOIRatio < 0.75) score -= 45;
  else if (volumeOIRatio < 1) score -= 28;
  else if (volumeOIRatio < 1.5) score -= 8;

  return score;
}

function isWeakDefaultContract(contract: MostActiveContract, referenceMs: number | null): boolean {
  const dte = expirationDays(contract, referenceMs);
  const volumeOIRatio = asFiniteNumber(contract.volumeOIRatio) ?? 0;
  const price = contractDisplayPrice(contract);

  if (price != null && price < 0.1) return true;
  if (dte != null && dte > 180) return true;
  if (dte != null && dte > 90 && volumeOIRatio < 5) return true;
  if (volumeOIRatio < 1 && (dte == null || dte > 7)) return true;

  return false;
}

function compareRankedContracts(left: RankedContract, right: RankedContract): number {
  if (right.score !== left.score) return right.score - left.score;
  if (right.volume !== left.volume) return right.volume - left.volume;
  return String(left.contract.symbol ?? '').localeCompare(String(right.contract.symbol ?? ''));
}

function dedupeContracts(contracts: MostActiveContract[]): MostActiveContract[] {
  const bySymbol = new Map<string, MostActiveContract>();
  let anonymousIndex = 0;

  for (const contract of contracts) {
    const symbol = typeof contract.symbol === 'string' && contract.symbol.trim()
      ? contract.symbol
      : `__anon__${anonymousIndex++}`;
    const existing = bySymbol.get(symbol);

    if (!existing) {
      bySymbol.set(symbol, contract);
      continue;
    }

    const existingVolume = asFiniteNumber(existing.volume) ?? -1;
    const candidateVolume = asFiniteNumber(contract.volume) ?? -1;
    const existingOpenInterest = asFiniteNumber(existing.openInterest) ?? -1;
    const candidateOpenInterest = asFiniteNumber(contract.openInterest) ?? -1;

    if (
      candidateVolume > existingVolume
      || (candidateVolume === existingVolume && candidateOpenInterest > existingOpenInterest)
    ) {
      bySymbol.set(symbol, contract);
    }
  }

  return [...bySymbol.values()];
}

function selectRepresentativeContracts(
  contracts: MostActiveContract[],
  referenceMs: number | null,
  displayLimit: number,
): MostActiveContract[] {
  const ranked = contracts
    .map((contract) => ({
      contract,
      score: scoreContractForDefaultView(contract, referenceMs),
      volume: asFiniteNumber(contract.volume) ?? 0,
    }))
    .sort(compareRankedContracts);

  const selected: RankedContract[] = [];
  const seenSymbols = new Set<string>();
  const perUnderlying = new Map<string, number>();
  const weakFallbackThreshold = Math.min(displayLimit, MIN_STRONG_CONTRACTS_WITHOUT_WEAK_FALLBACK);

  for (const entry of ranked) {
    if (isWeakDefaultContract(entry.contract, referenceMs)) continue;
    const symbol = typeof entry.contract.symbol === 'string' ? entry.contract.symbol : null;
    if (symbol && seenSymbols.has(symbol)) continue;
    const underlying = typeof entry.contract.underlying === 'string' && entry.contract.underlying.trim()
      ? entry.contract.underlying
      : 'UNKNOWN';
    if ((perUnderlying.get(underlying) ?? 0) >= MAX_CONTRACTS_PER_UNDERLYING) continue;
    selected.push(entry);
    perUnderlying.set(underlying, (perUnderlying.get(underlying) ?? 0) + 1);
    if (symbol) seenSymbols.add(symbol);
    if (selected.length >= displayLimit) {
      return selected.map(({ contract }) => contract);
    }
  }

  if (selected.length >= weakFallbackThreshold) {
    return selected.map(({ contract }) => contract);
  }

  for (const entry of ranked) {
    const symbol = typeof entry.contract.symbol === 'string' ? entry.contract.symbol : null;
    if (symbol && seenSymbols.has(symbol)) continue;
    const underlying = typeof entry.contract.underlying === 'string' && entry.contract.underlying.trim()
      ? entry.contract.underlying
      : 'UNKNOWN';
    if ((perUnderlying.get(underlying) ?? 0) >= MAX_CONTRACTS_PER_UNDERLYING) continue;
    selected.push(entry);
    perUnderlying.set(underlying, (perUnderlying.get(underlying) ?? 0) + 1);
    if (symbol) seenSymbols.add(symbol);
    if (selected.length >= displayLimit) break;
  }

  return selected.slice(0, displayLimit).map(({ contract }) => contract);
}

function summarizeMostActiveContracts(
  payload: MostActivePayload,
  contracts: MostActiveContract[],
  displayLimit = DEFAULT_CONTRACT_DISPLAY_LIMIT,
): MostActivePayload {
  const uniqueContracts = dedupeContracts(contracts);
  const referenceMs = parseTimestampMs(payload.timestamp);
  const selectedContracts = selectRepresentativeContracts(uniqueContracts, referenceMs, displayLimit);
  const totalVolume = uniqueContracts.reduce((sum, contract) => sum + (asFiniteNumber(contract.volume) ?? 0), 0);
  const totalOpenInterest = uniqueContracts.reduce((sum, contract) => sum + (asFiniteNumber(contract.openInterest) ?? 0), 0);
  const ivValues = selectedContracts
    .map((contract) => asFiniteNumber(contract.iv))
    .filter((value): value is number => value != null);
  const volumeOIRatios = selectedContracts
    .map((contract) => asFiniteNumber(contract.volumeOIRatio))
    .filter((value): value is number => value != null);
  const callContracts = selectedContracts.filter((contract) => contract.type === 'call').length;
  const putContracts = selectedContracts.filter((contract) => contract.type === 'put').length;

  const underlyingMap = new Map<string, {
    underlying: string;
    index: string | null;
    contractCount: number;
    totalVolume: number;
    totalOpenInterest: number;
    callContracts: number;
    putContracts: number;
    representativeContract: {
      symbol?: string;
      type?: string;
      expiration?: string;
      strike?: number;
      volume?: number;
      openInterest?: number;
      volumeOIRatio?: number;
      iv?: number;
      delta?: number;
    } | null;
    representativeScore: number;
    representativeQuality: 'selected' | 'strong' | 'weak_raw_leader';
    representativeContractNote?: string;
  }>();
  const selectedRepresentativeByUnderlying = new Map<string, {
    contract: MostActiveContract;
    score: number;
  }>();

  for (const contract of selectedContracts) {
    const underlying = typeof contract.underlying === 'string' && contract.underlying.trim()
      ? contract.underlying
      : 'UNKNOWN';
    const score = scoreContractForDefaultView(contract, referenceMs);
    const existing = selectedRepresentativeByUnderlying.get(underlying);
    if (!existing || score > existing.score) {
      selectedRepresentativeByUnderlying.set(underlying, { contract, score });
    }
  }

  for (const contract of uniqueContracts) {
    const underlying = typeof contract.underlying === 'string' && contract.underlying.trim()
      ? contract.underlying
      : 'UNKNOWN';
    const selectedRepresentative = selectedRepresentativeByUnderlying.get(underlying);
    const entry = underlyingMap.get(underlying) ?? {
      underlying,
      index: typeof contract.index === 'string' ? contract.index : null,
      contractCount: 0,
      totalVolume: 0,
      totalOpenInterest: 0,
      callContracts: 0,
      putContracts: 0,
      representativeContract: null,
      representativeScore: Number.NEGATIVE_INFINITY,
      representativeQuality: 'weak_raw_leader',
    };
    const volume = asFiniteNumber(contract.volume) ?? 0;
    const openInterest = asFiniteNumber(contract.openInterest) ?? 0;
    const representativeScore = scoreContractForDefaultView(contract, referenceMs);
    const representativeIsWeak = isWeakDefaultContract(contract, referenceMs);
    entry.contractCount += 1;
    entry.totalVolume += volume;
    entry.totalOpenInterest += openInterest;
    if (contract.type === 'call') entry.callContracts += 1;
    if (contract.type === 'put') entry.putContracts += 1;
    if (selectedRepresentative) {
      const selectedContract = selectedRepresentative.contract;
      entry.representativeContract = {
        symbol: typeof selectedContract.symbol === 'string' ? selectedContract.symbol : undefined,
        type: typeof selectedContract.type === 'string' ? selectedContract.type : undefined,
        expiration: typeof selectedContract.expiration === 'string' ? selectedContract.expiration : undefined,
        strike: asFiniteNumber(selectedContract.strike) ?? undefined,
        volume: asFiniteNumber(selectedContract.volume) ?? undefined,
        openInterest: asFiniteNumber(selectedContract.openInterest) ?? undefined,
        volumeOIRatio: asFiniteNumber(selectedContract.volumeOIRatio) ?? undefined,
        iv: asFiniteNumber(selectedContract.iv) ?? undefined,
        delta: asFiniteNumber(selectedContract.delta) ?? undefined,
      };
      entry.representativeScore = selectedRepresentative.score;
      entry.representativeQuality = 'selected';
      delete entry.representativeContractNote;
      underlyingMap.set(underlying, entry);
      continue;
    }
    if (
      !entry.representativeContract
      || (entry.representativeQuality === 'weak_raw_leader' && !representativeIsWeak)
      || (
        representativeIsWeak === (entry.representativeQuality === 'weak_raw_leader')
        && (
          representativeScore > entry.representativeScore
          || (representativeScore === entry.representativeScore && volume > (entry.representativeContract.volume ?? -1))
        )
      )
    ) {
      entry.representativeContract = {
        symbol: typeof contract.symbol === 'string' ? contract.symbol : undefined,
        type: typeof contract.type === 'string' ? contract.type : undefined,
        expiration: typeof contract.expiration === 'string' ? contract.expiration : undefined,
        strike: asFiniteNumber(contract.strike) ?? undefined,
        volume,
        openInterest,
        volumeOIRatio: asFiniteNumber(contract.volumeOIRatio) ?? undefined,
        iv: asFiniteNumber(contract.iv) ?? undefined,
        delta: asFiniteNumber(contract.delta) ?? undefined,
      };
      entry.representativeScore = representativeScore;
      entry.representativeQuality = representativeIsWeak ? 'weak_raw_leader' : 'strong';
      if (representativeIsWeak) {
        entry.representativeContract = null;
        entry.representativeContractNote = 'Only far-dated or otherwise weak raw leaders were available for this underlying, so the default view omits a specific representative contract.';
      } else {
        delete entry.representativeContractNote;
      }
    }
    underlyingMap.set(underlying, entry);
  }

  const byUnderlying = [...underlyingMap.values()]
    .sort((a, b) => {
      const qualityRank = { selected: 2, strong: 1, weak_raw_leader: 0 } as const;
      const qualityDiff = qualityRank[b.representativeQuality] - qualityRank[a.representativeQuality];
      if (qualityDiff !== 0) return qualityDiff;
      return b.totalVolume - a.totalVolume || b.contractCount - a.contractCount || a.underlying.localeCompare(b.underlying);
    })
    .slice(0, 10);

  return {
    type: 'contract',
    index: payload.index,
    timestamp: payload.timestamp,
    summary: {
      rawContractsConsidered: contracts.length,
      uniqueContractsConsidered: uniqueContracts.length,
      returnedContracts: selectedContracts.length,
      uniqueUnderlyings: underlyingMap.size,
      totalVolume,
      totalOpenInterest,
      callContracts,
      putContracts,
      averageIV: roundTo(ivValues.length > 0 ? ivValues.reduce((sum, value) => sum + value, 0) / ivValues.length : null, 4),
      averageVolumeOIRatio: roundTo(
        volumeOIRatios.length > 0 ? volumeOIRatios.reduce((sum, value) => sum + value, 0) / volumeOIRatios.length : null,
        4,
      ),
    },
    byUnderlying,
    contracts: selectedContracts,
    _contracts_note: uniqueContracts.length > selectedContracts.length
      ? `Default view shows ${selectedContracts.length} representative contracts out of ${uniqueContracts.length} unique raw leaders, favoring liquid current flow over penny or far-dated outliers.`
      : undefined,
  };
}

function summarizeMostActiveTickers(payload: MostActivePayload, tickers: MostActiveTicker[]): MostActivePayload {
  const totalVolume = tickers.reduce((sum, ticker) => sum + (asFiniteNumber(ticker.totalVolume) ?? 0), 0);
  const ivValues = tickers
    .map((ticker) => asFiniteNumber(ticker.atmIV))
    .filter((value): value is number => value != null);
  const putCallRatios = tickers
    .map((ticker) => asFiniteNumber(ticker.putCallRatio))
    .filter((value): value is number => value != null);
  const topTicker = tickers[0];

  return {
    type: 'ticker',
    index: payload.index,
    timestamp: payload.timestamp,
    summary: {
      returnedTickers: tickers.length,
      totalVolume,
      averageATMIV: roundTo(ivValues.length > 0 ? ivValues.reduce((sum, value) => sum + value, 0) / ivValues.length : null, 4),
      averagePutCallRatio: roundTo(
        putCallRatios.length > 0 ? putCallRatios.reduce((sum, value) => sum + value, 0) / putCallRatios.length : null,
        4,
      ),
      topTickerByVolume: topTicker && typeof topTicker.symbol === 'string'
        ? {
            symbol: topTicker.symbol,
            totalVolume: asFiniteNumber(topTicker.totalVolume),
            putCallRatio: asFiniteNumber(topTicker.putCallRatio),
            atmIV: asFiniteNumber(topTicker.atmIV),
          }
        : null,
    },
    tickers,
  };
}

export function summarizeMostActiveOptions(payload: unknown, contractDisplayLimit = DEFAULT_CONTRACT_DISPLAY_LIMIT): unknown {
  if (!payload || typeof payload !== 'object') return payload;
  const typed = payload as MostActivePayload;
  const data = Array.isArray(typed.data) ? typed.data : [];
  if (typed.type === 'contract') {
    return summarizeMostActiveContracts(typed, asArrayOfObjects<MostActiveContract>(data), contractDisplayLimit);
  }
  if (typed.type === 'ticker') {
    return summarizeMostActiveTickers(typed, asArrayOfObjects<MostActiveTicker>(data));
  }
  return payload;
}

function summarizeShortVolumeRow(row: ShortVolumeRow): Record<string, unknown> {
  const shortPercent = asPercentNumber(row.shortPercent)
    ?? asPercentNumber(row.shortPercentage)
    ?? asPercentNumber(row.shortInterestPercentFloat);
  return {
    date: typeof row.date === 'string' ? row.date : null,
    shortVolume: asFiniteNumber(row.shortVolume) ?? asFiniteNumber(row.shortInterest),
    totalVolume: asFiniteNumber(row.totalVolume),
    shortPercent: roundTo(shortPercent, 2),
    shortExemptVolume: asFiniteNumber(row.shortExemptVolume),
    markets: normalizeMarkets(row.markets),
  };
}

export function summarizeShortVolume(payload: unknown, historyLimit = 10): unknown {
  if (!payload || typeof payload !== 'object') return payload;
  const typed = payload as ShortVolumePayload;
  const history = asArrayOfObjects<ShortVolumeRow>(typed.history);
  const latestSource = typed.latest != null && typeof typed.latest === 'object'
    ? (typed.latest as ShortVolumeRow)
    : history[0];
  const latest = latestSource ? summarizeShortVolumeRow(latestSource) : null;
  const recentHistory = history.slice(0, historyLimit).map(summarizeShortVolumeRow);
  const shortPercents = recentHistory
    .map((row) => asPercentNumber(row.shortPercent))
    .filter((value): value is number => value != null);
  const trailingAverageShortPercent = asPercentNumber((typed.averages as Record<string, unknown> | undefined)?.avgShortPercentage)
    ?? (shortPercents.length > 0 ? shortPercents.reduce((sum, value) => sum + value, 0) / shortPercents.length : null);
  const latestShortPercent = latest ? asPercentNumber(latest.shortPercent) : null;
  const diffPctPoints = latestShortPercent != null && trailingAverageShortPercent != null
    ? latestShortPercent - trailingAverageShortPercent
    : null;
  const highestRecent = recentHistory.reduce<Record<string, unknown> | null>((best, row) => {
    const shortPercent = asPercentNumber(row.shortPercent);
    if (shortPercent == null) return best;
    if (!best || shortPercent > (asPercentNumber(best.shortPercent) ?? -Infinity)) return row;
    return best;
  }, null);
  const lowestRecent = recentHistory.reduce<Record<string, unknown> | null>((best, row) => {
    const shortPercent = asPercentNumber(row.shortPercent);
    if (shortPercent == null) return best;
    if (!best || shortPercent < (asPercentNumber(best.shortPercent) ?? Infinity)) return row;
    return best;
  }, null);

  return {
    symbol: typed.symbol,
    lastUpdate: typed.lastUpdate,
    latest,
    summary: {
      trailingAverageShortPercent: roundTo(trailingAverageShortPercent, 2),
      latestVsTrailingAveragePctPoints: roundTo(diffPctPoints, 2),
      recentTrend: diffPctPoints == null
        ? null
        : diffPctPoints >= 5
          ? 'elevated'
          : diffPctPoints <= -5
            ? 'below_average'
            : 'near_average',
      highestRecentShortPercent: highestRecent,
      lowestRecentShortPercent: lowestRecent,
    },
    recentHistory,
    trailingAverages: typed.averages ?? null,
    yearStats: typed.yearStats ?? null,
    _recent_history_note: history.length > historyLimit
      ? `Showing ${historyLimit} most recent sessions out of ${history.length}. Use full=true for the raw daily history.`
      : undefined,
  };
}

function summarizeShortInterestRow(row: ShortInterestRow): Record<string, unknown> {
  return {
    settlementDate: typeof row.settlementDate === 'string' ? row.settlementDate : null,
    shortInterest: asFiniteNumber(row.shortInterest),
    previousShortInterest: asFiniteNumber(row.previousShortInterest),
    changeNumber: asFiniteNumber(row.changeNumber),
    changePercent: roundTo(asFiniteNumber(row.changePercent), 2),
    avgDailyVolume: asFiniteNumber(row.avgDailyVolume),
    daysToCover: roundTo(asFiniteNumber(row.daysToCover), 2),
    shortPercentOfFloat: roundTo(asPercentNumber(row.shortPercentOfFloat), 2),
  };
}

function pickShareFloatFallback(payload: ShortInterestPayload, companyProfile?: unknown): ShareFloatFallback {
  const profile = getRecord(companyProfile);
  return {
    freeFloat: asFiniteNumber(payload.freeFloat)
      ?? asFiniteNumber(profile?.free_float_shares)
      ?? asFiniteNumber(profile?.freeFloat),
    sharesOutstanding: asFiniteNumber(payload.sharesOutstanding)
      ?? asFiniteNumber(profile?.shares_outstanding)
      ?? asFiniteNumber(profile?.sharesOutstanding),
  };
}

function enrichShortInterestRow(row: Record<string, unknown>, freeFloat: number | null): Record<string, unknown> {
  if (freeFloat == null || freeFloat <= 0 || row.shortPercentOfFloat != null) return row;
  const shortInterest = asFiniteNumber(row.shortInterest);
  if (shortInterest == null) return row;

  return {
    ...row,
    shortPercentOfFloat: roundTo((shortInterest / freeFloat) * 100, 2),
  };
}

export function summarizeShortInterest(payload: unknown, historyLimit = 8, companyProfile?: unknown): unknown {
  if (!payload || typeof payload !== 'object') return payload;
  const typed = payload as ShortInterestPayload;
  const shareFloat = pickShareFloatFallback(typed, companyProfile);
  const history = asArrayOfObjects<ShortInterestRow>(typed.history);
  const latestSource = typed.latest != null && typeof typed.latest === 'object'
    ? (typed.latest as ShortInterestRow)
    : history[0];
  const latest = latestSource
    ? enrichShortInterestRow(summarizeShortInterestRow(latestSource), shareFloat.freeFloat)
    : null;
  const recentHistory = history
    .slice(0, historyLimit)
    .map((row) => enrichShortInterestRow(summarizeShortInterestRow(row), shareFloat.freeFloat));
  const latestShortInterest = latest ? asFiniteNumber(latest.shortInterest) : null;
  const stats = typed.stats != null && typeof typed.stats === 'object'
    ? typed.stats as Record<string, unknown>
    : {};
  const avgShortInterest = asFiniteNumber(stats.avgShortInterest)
    ?? (() => {
      const values = history
        .map((row) => asFiniteNumber(row.shortInterest))
        .filter((value): value is number => value != null);
      return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    })();
  const latestVsAveragePct = latestShortInterest != null && avgShortInterest != null && avgShortInterest !== 0
    ? ((latestShortInterest - avgShortInterest) / avgShortInterest) * 100
    : null;
  const referenceRow = history[3] ?? history[history.length - 1];
  const referenceShortInterest = referenceRow ? asFiniteNumber(referenceRow.shortInterest) : null;
  const recentTrend = latestShortInterest != null && referenceShortInterest != null && referenceShortInterest !== 0
    ? ((latestShortInterest - referenceShortInterest) / referenceShortInterest) * 100
    : null;

  return {
    symbol: typed.symbol,
    lastUpdate: typed.lastUpdate,
    freeFloat: shareFloat.freeFloat,
    sharesOutstanding: shareFloat.sharesOutstanding,
    latest,
    summary: {
      periodsAvailable: asFiniteNumber(stats.periodsAvailable) ?? history.length,
      averageShortInterest: roundTo(avgShortInterest, 0),
      latestVsAveragePct: roundTo(latestVsAveragePct, 2),
      recentTrend: recentTrend == null
        ? null
        : recentTrend >= 5
          ? 'rising'
          : recentTrend <= -5
            ? 'falling'
            : 'stable',
      averageDaysToCover: roundTo(asFiniteNumber(stats.avgDaysToCover), 2),
      maxShortInterest: asFiniteNumber(stats.maxShortInterest),
      maxDate: typeof stats.maxDate === 'string' ? stats.maxDate : null,
      minShortInterest: asFiniteNumber(stats.minShortInterest),
      minDate: typeof stats.minDate === 'string' ? stats.minDate : null,
    },
    recentHistory,
    _recent_history_note: history.length > historyLimit
      ? `Showing ${historyLimit} most recent settlement periods out of ${history.length}. Use full=true for the full biweekly history.`
      : undefined,
  };
}
