import { ConsistencyClientError, truncateText } from './consistency-client-error';
import { STOCK_DEFECT_KINDS } from './consistency-types';
import type {
    ConsistencyIgnoredEntityType,
    ConsistencyIssue,
    ConsistencyIssuePage,
    ConsistencyCountComparison,
    ConsistencyStockDefects,
    ConsistencyStream,
    ConsistencySummary,
    StockDefectCounts,
} from './consistency-types';

export const MAX_DETAILS = 4096;
export const MAX_JSON_FIELD = 16384;

// Provider text is untrusted and stored as-is; an oversized field is replaced by a marked preview.
export function capJson(value: unknown): unknown {
    const text = JSON.stringify(value) ?? 'null';
    return text.length > MAX_JSON_FIELD ? { truncated: truncateText(text, MAX_JSON_FIELD) } : value;
}

type Json = Record<string, unknown>;

function malformed(what: string): never {
    throw new ConsistencyClientError('malformed', `Malformed consistency response: ${what}`);
}

function obj(value: unknown, what: string): Json {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) malformed(what);
    return value as Json;
}

function str(value: unknown, what: string): string {
    if (typeof value !== 'string' || value === '') malformed(what);
    return value;
}

function isoDate(value: unknown, what: string): string {
    const text = str(value, what);
    if (Number.isNaN(Date.parse(text))) malformed(what);
    return text;
}

function nullableIso(value: unknown, what: string): string | null {
    return value === null ? null : isoDate(value, what);
}

function int(value: unknown, what: string): number {
    if (typeof value !== 'number' || !Number.isInteger(value)) malformed(what);
    return value;
}

function counts(value: unknown, what: string): Record<string, number> {
    const source = obj(value, what);
    const out: Record<string, number> = {};
    for (const [key, count] of Object.entries(source)) out[key] = int(count, `${what}.${key}`);
    return out;
}

function parseStream(value: unknown): ConsistencyStream {
    const s = obj(value, 'streams[]');
    return {
        stream: str(s.stream, 'stream.stream'),
        lastAppliedEventAt: nullableIso(s.lastAppliedEventAt, 'stream.lastAppliedEventAt'),
        lagSeconds: int(s.lagSeconds, 'stream.lagSeconds'),
    };
}

function parseCovered(value: unknown): string[] {
    if (value === undefined) return [];
    if (!Array.isArray(value)) malformed('coveredEntityTypes');
    return value.map(v => str(v, 'coveredEntityTypes[]'));
}

function parseIgnored(value: unknown): ConsistencyIgnoredEntityType[] {
    if (value === undefined) return [];
    if (!Array.isArray(value)) malformed('ignoredEntityTypes');
    return value.map(v => {
        const i = obj(v, 'ignoredEntityTypes[]');
        return {
            entityType: str(i.entityType, 'ignoredEntityTypes.entityType'),
            reason: str(i.reason, 'ignoredEntityTypes.reason'),
        };
    });
}

function parseDefectCounts(value: unknown): StockDefectCounts | null {
    if (!value || typeof value !== 'object') return null;
    const source = value as Record<string, unknown>;
    const out = {} as StockDefectCounts;
    for (const kind of STOCK_DEFECT_KINDS) {
        const n = source[kind];
        if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) return null;
        out[kind] = n;
    }
    return out;
}

function parseStockDefects(value: unknown): ConsistencyStockDefects | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const v = value as Record<string, unknown>;
    const mirror = parseDefectCounts(v.mirror);
    const is = v.integrationService;
    if (!mirror || !is || typeof is !== 'object') return undefined;
    const i = is as Record<string, unknown>;
    return {
        mirror,
        integrationService: {
            counts: parseDefectCounts(i.counts),
            fetchedAt: typeof i.fetchedAt === 'string' ? i.fetchedAt : null,
            status: typeof i.status === 'string' ? i.status : 'error',
        },
    };
}

function nullableCount(value: unknown): number | null {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function parseCountComparison(value: unknown): ConsistencyCountComparison[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const out: ConsistencyCountComparison[] = [];
    for (const raw of value) {
        if (!raw || typeof raw !== 'object') continue;
        const c = raw as Record<string, unknown>;
        if (typeof c.stream !== 'string' || typeof c.status !== 'string') continue;
        out.push({
            stream: c.stream,
            basis: typeof c.basis === 'string' ? c.basis : '',
            status: c.status,
            mirrorCount: nullableCount(c.mirrorCount),
            expectedCount: nullableCount(c.expectedCount),
            differing: c.differing === true,
            fetchedAt: typeof c.fetchedAt === 'string' ? c.fetchedAt : null,
        });
    }
    return out;
}

export function parseSummary(body: unknown): ConsistencySummary {
    const b = obj(body, 'summary');
    const check = obj(b.lastCheck, 'lastCheck');
    const status = check.status;
    const mode = check.mode;
    if (status !== 'ok' && status !== 'failed' && status !== 'running')
        malformed('lastCheck.status');
    if (mode !== 'full' && mode !== 'incremental') malformed('lastCheck.mode');
    if (!Array.isArray(b.streams)) malformed('streams');
    return {
        generatedAt: isoDate(b.generatedAt, 'generatedAt'),
        lastCheck: {
            startedAt: isoDate(check.startedAt, 'lastCheck.startedAt'),
            finishedAt: nullableIso(check.finishedAt, 'lastCheck.finishedAt'),
            status,
            durationMs: check.durationMs === null ? null : int(check.durationMs, 'durationMs'),
            mode,
            checkedEntities: int(check.checkedEntities, 'checkedEntities'),
        },
        streams: b.streams.map(parseStream),
        openByType: counts(b.openByType, 'openByType'),
        openBySeverity: counts(b.openBySeverity, 'openBySeverity'),
        coveredEntityTypes: parseCovered(b.coveredEntityTypes),
        ignoredEntityTypes: parseIgnored(b.ignoredEntityTypes),
        stockDefects: parseStockDefects(b.stockDefects),
        countComparison: parseCountComparison(b.countComparison),
    };
}

function parseScope(value: unknown): Record<string, string> {
    const scope = obj(value, 'scope');
    const out: Record<string, string> = {};
    for (const [key, v] of Object.entries(scope)) out[key] = str(v, `scope.${key}`);
    return capJson(out) as Record<string, string>;
}

function parseIssue(value: unknown): ConsistencyIssue {
    const i = obj(value, 'issue');
    const status = i.status;
    if (status !== 'open' && status !== 'resolved') malformed('issue.status');
    if (typeof i.replayable !== 'boolean') malformed('issue.replayable');
    return {
        providerIssueId: str(i.id, 'issue.id'),
        type: str(i.type, 'issue.type'),
        severity: str(i.severity, 'issue.severity'),
        entityType: str(i.entityType, 'issue.entityType'),
        entityId: str(i.entityId, 'issue.entityId'),
        scope: parseScope(i.scope),
        expected: capJson(i.expected ?? null),
        actual: capJson(i.actual ?? null),
        details: truncateText(
            typeof i.details === 'string' ? i.details : malformed('issue.details'),
            MAX_DETAILS,
        ),
        replayable: i.replayable,
        occurrences: int(i.occurrences, 'issue.occurrences'),
        firstDetectedAt: isoDate(i.firstDetectedAt, 'issue.firstDetectedAt'),
        lastDetectedAt: isoDate(i.lastDetectedAt, 'issue.lastDetectedAt'),
        resolvedAt: nullableIso(i.resolvedAt, 'issue.resolvedAt'),
        status,
    };
}

export function parseIssuePage(body: unknown): ConsistencyIssuePage {
    const b = obj(body, 'page');
    if (!Array.isArray(b.items)) malformed('items');
    const nextCursor = b.nextCursor === null ? null : str(b.nextCursor, 'nextCursor');
    return { items: b.items.map(parseIssue), nextCursor };
}
