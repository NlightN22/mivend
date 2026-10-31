import { ConsistencyClientError } from './consistency-client-error';
import type {
    ConsistencyIgnoredEntityType,
    ConsistencyIssue,
    ConsistencyIssuePage,
    ConsistencyStream,
    ConsistencySummary,
} from './consistency-types';

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
    };
}

function parseScope(value: unknown): Record<string, string> {
    const scope = obj(value, 'scope');
    const out: Record<string, string> = {};
    for (const [key, v] of Object.entries(scope)) out[key] = str(v, `scope.${key}`);
    return out;
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
        expected: i.expected ?? null,
        actual: i.actual ?? null,
        details: typeof i.details === 'string' ? i.details : malformed('issue.details'),
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
