import type { StatusBadgeVariant } from '@mivend/ui-kit';

export const LAG_THRESHOLD = 1000n;

export function isLagOverThreshold(lag: string | null | undefined): boolean {
    return lag !== null && lag !== undefined && BigInt(lag) > LAG_THRESHOLD;
}

export interface AgeUnits {
    s: string;
    min: string;
    h: string;
    d: string;
}

export const EN_UNITS: AgeUnits = { s: 's', min: 'min', h: 'h', d: 'd' };

export function formatAge(
    from: string | null | undefined,
    now: number,
    u: AgeUnits = EN_UNITS,
): string {
    if (!from) return '—';
    const minutes = Math.max(0, Math.round((now - new Date(from).getTime()) / 60000));
    if (minutes < 60) return `${minutes} ${u.min}`;
    if (minutes < 1440) return `${Math.round(minutes / 60)} ${u.h}`;
    return `${Math.round(minutes / 1440)} ${u.d}`;
}

export function formatAgeSeconds(
    seconds: number | null | undefined,
    u: AgeUnits = EN_UNITS,
): string {
    if (seconds === null || seconds === undefined) return '—';
    if (seconds < 60) return `${seconds} ${u.s}`;
    if (seconds < 3600) return `${Math.round(seconds / 60)} ${u.min}`;
    if (seconds < 86400) return `${Math.round(seconds / 3600)} ${u.h}`;
    return `${Math.round(seconds / 86400)} ${u.d}`;
}

export function formatLag(seconds: number, u: AgeUnits = EN_UNITS): string {
    if (seconds < 90) return `${Math.round(seconds)} ${u.s}`;
    if (seconds < 5400) return `${Math.round(seconds / 60)} ${u.min}`;
    return `${(seconds / 3600).toFixed(1)} ${u.h}`;
}

export function dash(n: number | null | undefined): string {
    return n === null || n === undefined ? '—' : String(n);
}

export function exchangeStateVariant(state: string): StatusBadgeVariant {
    if (state === 'OK') return 'success';
    if (state === 'DOWN') return 'danger';
    return 'warning';
}

export function sourceHealthVariant(health: string): StatusBadgeVariant {
    if (health === 'ok') return 'success';
    return health === 'rate-limited' || health === 'no-check-yet' ? 'neutral' : 'danger';
}

export function severityVariant(severity: string): StatusBadgeVariant {
    return severity === 'critical' ? 'danger' : 'warning';
}

export const REPORT_STATUS_VARIANT: Record<string, StatusBadgeVariant> = {
    open: 'warning',
    resolved: 'success',
};

export const INBOX_STATUS_VARIANT: Record<string, StatusBadgeVariant> = {
    failed: 'danger',
    dependency_missing: 'warning',
    replay_requested: 'info',
};

export const OUTBOX_STATUS_VARIANT: Record<string, StatusBadgeVariant> = {
    failed: 'danger',
    skipped: 'warning',
};

export function countEntries(value: unknown): Array<[string, number]> {
    if (!value || typeof value !== 'object') return [];
    return Object.entries(value as Record<string, unknown>)
        .filter((e): e is [string, number] => typeof e[1] === 'number')
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export function totalOpen(localOpenBySeverity: unknown): number {
    return countEntries(localOpenBySeverity).reduce((sum, [, n]) => sum + n, 0);
}

export function streamLags(summary: unknown): Map<string, number> {
    const streams = (summary as { streams?: unknown } | null)?.streams;
    const lags = new Map<string, number>();
    if (!Array.isArray(streams)) return lags;
    for (const s of streams) {
        if (s && typeof s.stream === 'string' && typeof s.lagSeconds === 'number')
            lags.set(s.stream, s.lagSeconds);
    }
    return lags;
}

export interface CountComparisonRow {
    stream: string;
    status: string;
    mirror: number | null;
    expected: number | null;
    differs: boolean;
}

const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);

export function countComparisonView(summary: unknown): CountComparisonRow[] {
    const list = (summary as { countComparison?: unknown } | null)?.countComparison;
    if (!Array.isArray(list)) return [];
    return list.flatMap((raw: Record<string, unknown>) => {
        if (typeof raw?.stream !== 'string' || typeof raw.status !== 'string') return [];
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

export const DEFECT_KINDS = [
    'negativeReserved',
    'availableExceedsQuantity',
    'negativeAvailable',
    'negativeQuantity',
] as const;

export interface StockDefectRow {
    kind: (typeof DEFECT_KINDS)[number];
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
    const mirrorCounts = DEFECT_KINDS.map(kind => counted(defects.mirror, kind));
    if (mirrorCounts.includes(null)) return null;
    const is = (defects.integrationService ?? {}) as Record<string, unknown>;
    const status = typeof is.status === 'string' ? is.status : 'error';
    return {
        rows: DEFECT_KINDS.map((kind, i) => {
            const mirror = mirrorCounts[i] as number;
            const integrationService = counted(is.counts, kind);
            return {
                kind,
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

export function formatJson(value: unknown): string {
    if (value === null || value === undefined) return '—';
    return typeof value === 'string' ? value : JSON.stringify(value);
}

// A provider count object shows its count, anything else its JSON, cut to one line.
export function figureText(value: unknown, max = 60): string {
    const count = (value as { count?: unknown } | null)?.count;
    const text = typeof count === 'number' ? String(count) : formatJson(value);
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export const UNKNOWN_REASONS = [
    'NOT_CONFIGURED',
    'UNAUTHORIZED',
    'TIMEOUT',
    'UNREACHABLE',
    'SERVER_ERROR',
    'BAD_RESPONSE',
    'NEVER_POLLED',
    'STALE',
] as const;

export function unknownReasonKey(reason: string | null | undefined): string {
    return (UNKNOWN_REASONS as readonly string[]).includes(reason ?? '')
        ? (reason as string)
        : 'OTHER';
}

export function differenceText(mirror: number | null, expected: number | null): string {
    if (mirror === null || expected === null) return '—';
    const diff = mirror - expected;
    if (diff === 0) return '—';
    return diff > 0 ? `+${diff}` : String(diff);
}
