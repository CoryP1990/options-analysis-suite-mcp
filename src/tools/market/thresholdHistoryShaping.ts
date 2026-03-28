type ThresholdHistoryResponse = {
  symbol?: string;
  thresholdDates?: string[];
  totalDatesChecked?: number;
  datesOnThreshold?: number;
  source?: string;
  [key: string]: unknown;
};

const DEFAULT_RECENT_CAP = 8;

function sortDesc(dates: string[]): string[] {
  return dates
    .filter((date): date is string => typeof date === 'string' && date.length > 0)
    .slice()
    .sort((a, b) => b.localeCompare(a));
}

function computeLongestStreak(checkedDates: string[], thresholdSet: Set<string>): number {
  let longest = 0;
  let current = 0;

  for (const date of checkedDates) {
    if (thresholdSet.has(date)) {
      current += 1;
      if (current > longest) longest = current;
    } else {
      current = 0;
    }
  }

  return longest;
}

function computeCurrentStreak(checkedDates: string[], thresholdSet: Set<string>): number {
  let streak = 0;

  for (const date of checkedDates) {
    if (!thresholdSet.has(date)) break;
    streak += 1;
  }

  return streak;
}

function buildStatus(isCurrentlyOnThreshold: boolean, lastSeenIndex: number): string {
  if (isCurrentlyOnThreshold) return 'currently_on_threshold';
  if (lastSeenIndex >= 0 && lastSeenIndex <= 4) return 'recently_cleared';
  if (lastSeenIndex >= 0) return 'historical_only';
  return 'not_on_threshold';
}

export function summarizeThresholdHistory(
  payload: ThresholdHistoryResponse,
  checkedDates: string[],
  recentCap = DEFAULT_RECENT_CAP,
): Record<string, unknown> {
  const normalizedCheckedDates = sortDesc(checkedDates);
  const normalizedThresholdDates = sortDesc(
    Array.isArray(payload.thresholdDates) ? payload.thresholdDates : [],
  );
  const thresholdSet = new Set(normalizedThresholdDates);
  const latestCheckedDate = normalizedCheckedDates[0] ?? null;
  const oldestCheckedDate = normalizedCheckedDates[normalizedCheckedDates.length - 1] ?? null;
  const latestThresholdDate = normalizedThresholdDates[0] ?? null;
  const lastSeenIndex = latestThresholdDate != null ? normalizedCheckedDates.indexOf(latestThresholdDate) : -1;
  const isCurrentlyOnThreshold = latestCheckedDate != null && thresholdSet.has(latestCheckedDate);
  const currentStreak = computeCurrentStreak(normalizedCheckedDates, thresholdSet);
  const longestStreak = computeLongestStreak(normalizedCheckedDates, thresholdSet);
  const totalDatesChecked = Number.isFinite(payload.totalDatesChecked)
    ? Number(payload.totalDatesChecked)
    : normalizedCheckedDates.length;
  const datesOnThreshold = Number.isFinite(payload.datesOnThreshold)
    ? Number(payload.datesOnThreshold)
    : normalizedThresholdDates.length;
  const daysOnThresholdPct = totalDatesChecked > 0
    ? Number(((datesOnThreshold / totalDatesChecked) * 100).toFixed(1))
    : 0;

  return {
    symbol: payload.symbol ?? null,
    status: buildStatus(isCurrentlyOnThreshold, lastSeenIndex),
    summary: {
      totalDatesChecked,
      datesOnThreshold,
      daysOnThresholdPct,
      latestCheckedDate,
      oldestCheckedDate,
      latestThresholdDate,
      isCurrentlyOnThreshold,
      currentStreakDays: currentStreak,
      longestStreakDays: longestStreak,
      checkedDaysSinceLastThreshold: lastSeenIndex >= 0 ? lastSeenIndex : null,
      source: payload.source ?? null,
    },
    recentThresholdDates: normalizedThresholdDates.slice(0, recentCap),
    _recent_threshold_note: normalizedThresholdDates.length > recentCap
      ? `Showing ${recentCap} most recent threshold dates out of ${normalizedThresholdDates.length}. Use full=true for the raw date list.`
      : undefined,
    ...(normalizedThresholdDates.length === 0
      ? { _threshold_note: 'The symbol did not appear on the threshold list in the requested checked-date window.' }
      : {}),
  };
}
