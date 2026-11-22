import { parsePublishChannel } from './exchange-publish';
import type { ExchangeMappingError, ExchangePublishChannel } from './exchange-publish';

export type ExchangeStatus = 'OK' | 'DEGRADED' | 'DOWN';
export type ExchangeState = ExchangeStatus | 'UNKNOWN';
export type ExchangeUnknownReason =
    | 'NOT_CONFIGURED'
    | 'UNAUTHORIZED'
    | 'TIMEOUT'
    | 'UNREACHABLE'
    | 'SERVER_ERROR'
    | 'BAD_RESPONSE'
    | 'NEVER_POLLED'
    | 'STALE';

export interface ExchangeStream {
    stream: string;
    entityType: string;
    status: ExchangeStatus;
    lastActivityAt: string | null;
    // ingest/pull: rows or commands still pending; ack: commands delivered and not yet acknowledged.
    pending: number | null;
    oldestAgeSeconds: number | null;
    // ingest: failed inbox rows; ack: commands the ERP rejected; pull: null.
    failedLast24h: number | null;
}

export interface ExchangeChannel {
    channel: 'ingest' | 'pull' | 'ack';
    status: ExchangeStatus;
    lastActivityAt: string | null;
    streams: ExchangeStream[];
}

export interface ExchangeResyncSignal {
    id: string;
    stream: string;
    dryRun: boolean;
    status: string;
    createdAt: string;
}

export interface ExchangeHealth {
    generatedAt: string;
    status: ExchangeStatus;
    channels: ExchangeChannel[];
    publish: ExchangePublishChannel | null;
    mappingErrors: ExchangeMappingError[];
    failures: {
        status: ExchangeStatus;
        inboxFailedLast24h: number | null;
        outboxFailedLast24h: number | null;
        outboundRejectedLast24h: number | null;
    };
    resync: {
        pending: number | null;
        delivered: number | null;
        acknowledgedLast24h: number | null;
        rejectedLast24h: number | null;
        open: ExchangeResyncSignal[];
    };
}

export class ExchangeHealthReadError extends Error {
    constructor(
        readonly reason: ExchangeUnknownReason,
        message: string,
    ) {
        super(message);
    }
}

const STATUSES: readonly string[] = ['OK', 'DEGRADED', 'DOWN'];
const CHANNELS = ['ingest', 'pull', 'ack'] as const;

function bad(what: string): never {
    throw new ExchangeHealthReadError('BAD_RESPONSE', `exchange health response: ${what}`);
}

function record(value: unknown, what: string): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) bad(what);
    return value as Record<string, unknown>;
}

function status(value: unknown, what: string): ExchangeStatus {
    if (typeof value !== 'string' || !STATUSES.includes(value)) bad(`${what} has no valid status`);
    return value as ExchangeStatus;
}

function text(value: unknown, what: string): string {
    if (typeof value !== 'string' || value === '') bad(`${what} is missing`);
    return value as string;
}

const optionalText = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const count = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : null;

function stream(channel: (typeof CHANNELS)[number], raw: unknown): ExchangeStream {
    const row = record(raw, `${channel} stream`);
    const ack = channel === 'ack';
    return {
        stream: text(row.stream, `${channel} stream name`),
        entityType: optionalText(row.entityType) ?? '',
        status: status(row.status, `${channel} stream`),
        lastActivityAt: optionalText(row.lastActivityAt),
        pending: count(ack ? row.deliveredUnacknowledged : row.pending),
        oldestAgeSeconds: count(ack ? row.oldestDeliveredAgeSeconds : row.oldestPendingAgeSeconds),
        failedLast24h: count(ack ? row.rejectedLast24h : row.failedLast24h),
    };
}

function channel(name: (typeof CHANNELS)[number], raw: unknown): ExchangeChannel {
    const row = record(raw, `channel ${name}`);
    if (!Array.isArray(row.streams)) bad(`channel ${name} has no streams`);
    return {
        channel: name,
        status: status(row.status, `channel ${name}`),
        lastActivityAt: optionalText(row.lastActivityAt),
        streams: (row.streams as unknown[]).map(s => stream(name, s)),
    };
}

function signal(raw: unknown): ExchangeResyncSignal {
    const row = record(raw, 'resync signal');
    return {
        id: text(row.id, 'resync signal id'),
        stream: optionalText(row.stream) ?? '',
        dryRun: row.dryRun === true,
        status: optionalText(row.status) ?? '',
        createdAt: optionalText(row.createdAt) ?? '',
    };
}

// Unknown fields are ignored (the service only adds fields); a missing status or channel is a BAD_RESPONSE, never OK.
export function parseExchangeHealth(raw: unknown): ExchangeHealth {
    const body = record(raw, 'body');
    const channels = record(body.channels, 'channels');
    const failures = record(body.failures24h, 'failures24h');
    const resync = record(body.resyncSignals, 'resyncSignals');
    return {
        generatedAt: text(body.generatedAt, 'generatedAt'),
        status: status(body.status, 'overall'),
        channels: CHANNELS.map(name => channel(name, channels[name])),
        publish: parsePublishChannel(channels.publish),
        mappingErrors: [],
        failures: {
            status: status(failures.status, 'failures24h'),
            inboxFailedLast24h: count(failures.inboxFailedLast24h),
            outboxFailedLast24h: count(failures.outboxFailedLast24h),
            outboundRejectedLast24h: count(failures.outboundRejectedLast24h),
        },
        resync: {
            pending: count(resync.pending),
            delivered: count(resync.delivered),
            acknowledgedLast24h: count(resync.acknowledgedLast24h),
            rejectedLast24h: count(resync.rejectedLast24h),
            open: Array.isArray(resync.open) ? resync.open.map(signal) : [],
        },
    };
}

export function reasonForHttpStatus(httpStatus: number): ExchangeUnknownReason {
    return httpStatus === 401 || httpStatus === 403 ? 'UNAUTHORIZED' : 'SERVER_ERROR';
}

export interface ExchangeHealthSnapshotView {
    state: ExchangeState;
    reason: ExchangeUnknownReason | null;
    polledAt: Date | null;
    health: ExchangeHealth | null;
}

export interface StoredExchangeSnapshot {
    state: ExchangeState;
    reason: string | null;
    health: ExchangeHealth | null;
    polledAt: Date;
}

// A poller that stopped writing must read as unknown, not as the last green answer.
export const STALE_AFTER_POLLS = 3;

export function viewSnapshot(
    stored: StoredExchangeSnapshot | null,
    now: Date,
    pollIntervalMs: number,
): ExchangeHealthSnapshotView {
    if (!stored) return { state: 'UNKNOWN', reason: 'NEVER_POLLED', polledAt: null, health: null };
    if (now.getTime() - stored.polledAt.getTime() > pollIntervalMs * STALE_AFTER_POLLS) {
        return { state: 'UNKNOWN', reason: 'STALE', polledAt: stored.polledAt, health: null };
    }
    return {
        state: stored.state,
        reason: stored.state === 'UNKNOWN' ? (stored.reason as ExchangeUnknownReason) : null,
        polledAt: stored.polledAt,
        health: stored.health && {
            ...stored.health,
            publish: stored.health.publish ?? null,
            mappingErrors: stored.health.mappingErrors ?? [],
        },
    };
}
