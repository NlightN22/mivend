export type ConsistencySourceId = 'search-service';

export interface ConsistencySourceConfig {
    source: ConsistencySourceId;
    baseUrl: string;
    apiKey: string;
    // The provider's own check schedule; a check older than 3x this is reported as stale.
    checkIntervalMs: number;
}

export interface ConsistencyLastCheck {
    startedAt: string;
    finishedAt: string | null;
    status: 'ok' | 'failed' | 'running';
    durationMs: number | null;
    mode: 'full' | 'incremental';
    checkedEntities: number;
}

export interface ConsistencyStream {
    stream: string;
    lastAppliedEventAt: string | null;
    lagSeconds: number;
}

export interface ConsistencyIgnoredEntityType {
    entityType: string;
    reason: string;
}

export const STOCK_DEFECT_KINDS = [
    'negativeReserved',
    'availableExceedsQuantity',
    'negativeAvailable',
    'negativeQuantity',
] as const;

export type StockDefectCounts = Record<(typeof STOCK_DEFECT_KINDS)[number], number>;

export interface ConsistencyStockDefects {
    mirror: StockDefectCounts;
    integrationService: {
        counts: StockDefectCounts | null;
        fetchedAt: string | null;
        status: string;
    };
}

export interface ConsistencyCountComparison {
    stream: string;
    basis: string;
    status: string;
    mirrorCount: number | null;
    expectedCount: number | null;
    differing: boolean;
    fetchedAt: string | null;
}

export interface ConsistencySummary {
    generatedAt: string;
    lastCheck: ConsistencyLastCheck;
    streams: ConsistencyStream[];
    openByType: Record<string, number>;
    openBySeverity: Record<string, number>;
    // Stream names, not issue entityTypes; empty when an older provider omits them.
    coveredEntityTypes: string[];
    ignoredEntityTypes: ConsistencyIgnoredEntityType[];
    // Absent when an older provider omits it or sends it malformed; never fails the poll.
    stockDefects?: ConsistencyStockDefects;
    // Absent when an older provider omits it; malformed entries are skipped, never fail the poll.
    countComparison?: ConsistencyCountComparison[];
}

export interface ConsistencyIssue {
    providerIssueId: string;
    type: string;
    severity: string;
    entityType: string;
    entityId: string;
    scope: Record<string, string>;
    expected: unknown;
    actual: unknown;
    details: string;
    replayable: boolean;
    occurrences: number;
    firstDetectedAt: string;
    lastDetectedAt: string;
    resolvedAt: string | null;
    status: 'open' | 'resolved';
}

export interface ConsistencyIssuePage {
    items: ConsistencyIssue[];
    nextCursor: string | null;
}

export type ConsistencyHealth =
    | 'ok'
    | 'unreachable'
    | 'unauthorized'
    | 'no-check-yet'
    | 'stale'
    | 'invalid-response'
    | 'rate-limited';

export const REPORT_UNAVAILABLE_TYPE = 'report-unavailable';
export const REPORT_UNAVAILABLE_ISSUE_ID = 'report-unavailable';
export const STALE_CHECK_FACTOR = 3;
export const CONSISTENCY_POLL_INTERVAL_DEFAULT = 5 * 60_000;
export const CONSISTENCY_CHECK_INTERVAL_DEFAULT = 6 * 60 * 60_000;
export const CONSISTENCY_RETENTION_DAYS_DEFAULT = 90;
