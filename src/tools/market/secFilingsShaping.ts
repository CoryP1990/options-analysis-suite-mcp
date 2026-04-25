type FilingRow = {
  formType?: string | null;
  description?: string | null;
  filingDate?: string | null;
  accessionNumber?: string | null;
  primaryDocument?: string | null;
  url?: string | null;
  secUrl?: string | null;
  [key: string]: unknown;
};

type SecFilingsResponse = {
  symbol?: string;
  companyName?: string | null;
  cik?: string | null;
  filings?: FilingRow[];
  error?: string;
  message?: string;
  source?: string | null;
  [key: string]: unknown;
};

const DEFAULT_RECENT_CAP = 10;

function normalizeFormType(formType: string | null | undefined): string {
  return typeof formType === 'string' ? formType.trim().toUpperCase() : '';
}

function categorizeForm(formType: string): string {
  if (formType.startsWith('10-K')) return 'annualReport';
  if (formType.startsWith('10-Q')) return 'quarterlyReport';
  if (formType === '8-K') return 'currentReport';
  if (formType.startsWith('DEF 14A')) return 'proxyStatement';
  if (formType === '4') return 'insiderTrading';
  if (formType.startsWith('13D') || formType.startsWith('13G')) return 'beneficialOwnership';
  if (formType.startsWith('S-1') || formType.startsWith('S-3') || formType.startsWith('424B')) return 'offeringOrRegistration';
  return 'other';
}

function trimFiling(filing: FilingRow): Record<string, unknown> {
  return {
    formType: filing.formType ?? null,
    description: filing.description ?? filing.formType ?? null,
    filingDate: filing.filingDate ?? null,
    accessionNumber: filing.accessionNumber ?? null,
    primaryDocument: filing.primaryDocument ?? null,
    url: filing.url ?? filing.secUrl ?? null,
  };
}

export function shapeSecFilingsResponse(
  payload: SecFilingsResponse,
  recentCap = DEFAULT_RECENT_CAP,
): Record<string, unknown> {
  const filings = Array.isArray(payload.filings) ? payload.filings : [];
  const trimmedFilings = filings.map(trimFiling);
  const recentFilings = trimmedFilings.slice(0, recentCap);
  const formCounts: Record<string, number> = {};
  const categoryCounts: Record<string, number> = {};
  const latestByCategory: Record<string, Record<string, unknown>> = {};

  for (let i = 0; i < filings.length; i += 1) {
    const filing = filings[i];
    const formType = normalizeFormType(filing.formType);
    const category = categorizeForm(formType);

    if (formType) {
      formCounts[formType] = (formCounts[formType] ?? 0) + 1;
    }
    categoryCounts[category] = (categoryCounts[category] ?? 0) + 1;

    if (!(category in latestByCategory)) {
      latestByCategory[category] = trimFiling(filing);
    }
  }

  return {
    symbol: payload.symbol ?? null,
    companyName: payload.companyName ?? null,
    cik: payload.cik ?? null,
    summary: {
      totalFilings: filings.length,
      latestFilingDate: trimmedFilings[0]?.filingDate ?? null,
      latestFormType: trimmedFilings[0]?.formType ?? null,
      formCounts,
      categoryCounts,
      source: payload.source ?? 'sec.gov',
    },
    latestByCategory,
    recentFilings,
    ...(payload.error ? { error: payload.error } : {}),
    ...(payload.message ? { message: payload.message } : {}),
    ...(filings.length > recentCap
      ? { _recent_filings_meta: { showing: recentFilings.length, total: filings.length, truncated: true } }
      : {}),
    ...(filings.length === 0
      ? { _filings_note: payload.message ?? 'No recent SEC filings matched the requested symbol and filters.' }
      : {}),
  };
}
