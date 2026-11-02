export type HealthVariant = 'secondary' | 'outline' | 'destructive';

export interface SourceLike {
    health: string;
    summary: unknown;
    localOpenByType: unknown;
    localOpenBySeverity: unknown;
}

interface SummaryStream {
    stream: string;
    lagSeconds: number;
}

export const STATUS_OPTIONS = [
    { label: 'Open', value: 'open' },
    { label: 'Resolved', value: 'resolved' },
    { label: 'All', value: 'all' },
];

export function healthVariant(health: string): HealthVariant {
    if (health === 'ok') return 'secondary';
    return health === 'rate-limited' || health === 'no-check-yet' ? 'outline' : 'destructive';
}

export function countEntries(value: unknown): Array<[string, number]> {
    if (!value || typeof value !== 'object') return [];
    return Object.entries(value as Record<string, unknown>)
        .filter((e): e is [string, number] => typeof e[1] === 'number')
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export function totalOpen(source: SourceLike): number {
    return countEntries(source.localOpenBySeverity).reduce((sum, [, n]) => sum + n, 0);
}

export function streamLags(summary: unknown): SummaryStream[] {
    const streams = (summary as { streams?: unknown } | null)?.streams;
    if (!Array.isArray(streams)) return [];
    return streams.filter(
        (s): s is SummaryStream =>
            !!s && typeof s.stream === 'string' && typeof s.lagSeconds === 'number',
    );
}

export function formatLag(seconds: number): string {
    if (seconds < 90) return `${Math.round(seconds)} s`;
    if (seconds < 5400) return `${Math.round(seconds / 60)} min`;
    return `${(seconds / 3600).toFixed(1)} h`;
}

export function formatJson(value: unknown): string {
    if (value === null || value === undefined) return '—';
    return typeof value === 'string' ? value : JSON.stringify(value);
}

export interface ReportFilterInput {
    source?: string;
    status?: string;
    type?: string;
    severity?: string;
    entityType?: string;
}

interface ListPageFilter {
    _and?: Array<Record<string, unknown>>;
}

// ListPage sends facets as arrays and the funnel text filter as `{ contains }`/`{ eq }`; the backend takes scalars.
function unwrap(filter: ListPageFilter | undefined, id: string): string | undefined {
    const raw = filter?._and?.find(f => id in f)?.[id];
    const value = Array.isArray(raw)
        ? raw[0]
        : raw && typeof raw === 'object'
          ? ((raw as Record<string, unknown>).eq ?? (raw as Record<string, unknown>).contains)
          : raw;
    return typeof value === 'string' && value ? value : undefined;
}

export function toReportFilter(filter: ListPageFilter | undefined): ReportFilterInput {
    return {
        source: unwrap(filter, 'source'),
        status: unwrap(filter, 'status') ?? 'open',
        type: unwrap(filter, 'type'),
        severity: unwrap(filter, 'severity'),
        entityType: unwrap(filter, 'entityType'),
    };
}

// Covered only by the stream-stalled liveness check, never by content checks (provider API text).
export const LIVENESS_ONLY_TYPES = ['price', 'warehouse', 'category'];

export function livenessOnlyTypes(covered: readonly string[]): string[] {
    return LIVENESS_ONLY_TYPES.filter(t => covered.includes(t));
}

const DEFECT_LABELS: Array<[string, string]> = [
    ['negativeReserved', 'Reserved < 0'],
    ['availableExceedsQuantity', 'Available > quantity'],
    ['negativeAvailable', 'Available < 0'],
    ['negativeQuantity', 'Quantity < 0'],
];

export interface StockDefectRow {
    kind: string;
    label: string;
    mirror: number;
    integrationService: number | null;
    differs: boolean;
}

export interface StockDefectsView {
    rows: StockDefectRow[];
    status: string;
    fetchedAt: string | null;
}

function counted(value: unknown, kind: string): number | null {
    const n = (value as Record<string, unknown> | null | undefined)?.[kind];
    return typeof n === 'number' && Number.isInteger(n) && n >= 0 ? n : null;
}

export function stockDefectsView(summary: unknown): StockDefectsView | null {
    const defects = (summary as { stockDefects?: Record<string, unknown> } | null)?.stockDefects;
    if (!defects?.mirror) return null;
    const mirrorCounts = DEFECT_LABELS.map(([kind]) => counted(defects.mirror, kind));
    if (mirrorCounts.includes(null)) return null;
    const is = (defects.integrationService ?? {}) as Record<string, unknown>;
    const status = typeof is.status === 'string' ? is.status : 'error';
    return {
        rows: DEFECT_LABELS.map(([kind, label], i) => {
            const mirror = mirrorCounts[i] as number;
            const integrationService = counted(is.counts, kind);
            return {
                kind,
                label,
                mirror,
                integrationService,
                differs:
                    status === 'ok' && integrationService !== null && integrationService !== mirror,
            };
        }),
        status,
        fetchedAt: typeof is.fetchedAt === 'string' ? is.fetchedAt : null,
    };
}
