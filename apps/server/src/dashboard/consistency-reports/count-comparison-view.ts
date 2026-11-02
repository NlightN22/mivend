export interface CountComparisonRow {
    stream: string;
    status: string;
    mirror: number | null;
    expected: number | null;
    differs: boolean;
}

// Rows in the provider's order; a non-ok status means the figures are not a verdict.
export function countComparisonView(summary: unknown): CountComparisonRow[] {
    const list = (summary as { countComparison?: unknown } | null)?.countComparison;
    if (!Array.isArray(list)) return [];
    return list.flatMap((raw: Record<string, unknown>) => {
        if (typeof raw?.stream !== 'string' || typeof raw.status !== 'string') return [];
        const num = (v: unknown) => (typeof v === 'number' ? v : null);
        return [
            {
                stream: raw.stream,
                status: raw.status,
                mirror: num(raw.mirrorCount),
                expected: num(raw.expectedCount),
                differs: raw.status === 'ok' && raw.differing === true,
            },
        ];
    });
}
