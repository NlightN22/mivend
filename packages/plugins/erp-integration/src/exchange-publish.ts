import type { ExchangeStatus } from './exchange-health';

export interface ExchangePublishAggregate {
    aggregateType: string;
    status: ExchangeStatus;
    mappingErrorsLast24h: number | null;
    mappingErrorCodes: string[];
    deadLetteredLast24h: number | null;
    pending: number | null;
    oldestPendingAgeSeconds: number | null;
    lastPublishedAt: string | null;
}

export interface ExchangePublishChannel {
    status: ExchangeStatus;
    lastActivityAt: string | null;
    aggregates: ExchangePublishAggregate[];
}

export interface ExchangeMappingError {
    kind: string;
    code: string;
    message: string;
    occurrences: number | null;
    lastSeenAt: string | null;
}

const STATUSES: readonly string[] = ['OK', 'DEGRADED', 'DOWN'];
const MAX_MESSAGE_LENGTH = 300;
export const MAX_MAPPING_ERRORS = 50;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const num = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : null;
const isStatus = (value: unknown): value is ExchangeStatus =>
    typeof value === 'string' && STATUSES.includes(value);

function aggregate(raw: unknown): ExchangePublishAggregate | null {
    if (!isRecord(raw) || !isStatus(raw.status) || !str(raw.aggregateType)) return null;
    return {
        aggregateType: raw.aggregateType as string,
        status: raw.status,
        mappingErrorsLast24h: num(raw.mappingErrorsLast24h),
        mappingErrorCodes: Array.isArray(raw.mappingErrorCodes)
            ? raw.mappingErrorCodes.filter((c): c is string => typeof c === 'string')
            : [],
        deadLetteredLast24h: num(raw.deadLetteredLast24h),
        pending: num(raw.pending),
        oldestPendingAgeSeconds: num(raw.oldestPendingAgeSeconds),
        lastPublishedAt: str(raw.lastPublishedAt),
    };
}

// The publish channel is additive: an older service omits it and a malformed one is ignored, never a BAD_RESPONSE.
export function parsePublishChannel(raw: unknown): ExchangePublishChannel | null {
    if (!isRecord(raw) || !isStatus(raw.status) || !Array.isArray(raw.aggregates)) return null;
    return {
        status: raw.status,
        lastActivityAt: str(raw.lastActivityAt),
        aggregates: raw.aggregates
            .map(aggregate)
            .filter((a): a is ExchangePublishAggregate => a !== null),
    };
}

export function parseMappingErrors(raw: unknown): ExchangeMappingError[] {
    if (!isRecord(raw) || !Array.isArray(raw.items)) return [];
    const errors: ExchangeMappingError[] = [];
    for (const item of raw.items) {
        if (!isRecord(item) || !str(item.kind) || !str(item.code)) continue;
        errors.push({
            kind: item.kind as string,
            code: item.code as string,
            message: (str(item.message) ?? '').slice(0, MAX_MESSAGE_LENGTH),
            occurrences: num(item.occurrences),
            lastSeenAt: str(item.lastSeenAt),
        });
    }
    return errors.slice(0, MAX_MAPPING_ERRORS);
}
