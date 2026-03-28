type AnnotationRecord = {
  symbol?: string | null;
  type?: string | null;
  timestamp?: number | string | null;
  data?: Record<string, unknown> | null;
  [key: string]: unknown;
};

type AnnotationResponse = {
  data?: AnnotationRecord[];
  count?: number;
  [key: string]: unknown;
};

function normalizeAnnotation(record: AnnotationRecord): Record<string, unknown> {
  const data = record.data && typeof record.data === 'object' && !Array.isArray(record.data)
    ? record.data
    : null;

  return {
    symbol: record.symbol ?? '',
    type: record.type ?? 'note',
    timestamp: record.timestamp ?? null,
    ...(data ? { details: data } : {}),
  };
}

export function shapeAnnotationsResponse(payload: AnnotationResponse): Record<string, unknown> {
  const annotations = Array.isArray(payload.data)
    ? payload.data.map(normalizeAnnotation)
    : [];

  if (annotations.length === 0) {
    return {
      count: 0,
      annotations: [],
      summary: {
        symbolsCovered: 0,
        typeCounts: {},
      },
      _note: 'No synced annotations found yet. This tool only returns notes, tags, or alerts after they have been created in the platform and synced.',
    };
  }

  const typeCounts = annotations.reduce<Record<string, number>>((acc, annotation) => {
    const type = String(annotation.type ?? 'note');
    acc[type] = (acc[type] ?? 0) + 1;
    return acc;
  }, {});
  const symbolsCovered = new Set(
    annotations
      .map((annotation) => String(annotation.symbol ?? '').trim())
      .filter(Boolean),
  ).size;

  return {
    count: typeof payload.count === 'number' ? payload.count : annotations.length,
    annotations,
    summary: {
      symbolsCovered,
      typeCounts,
    },
  };
}
