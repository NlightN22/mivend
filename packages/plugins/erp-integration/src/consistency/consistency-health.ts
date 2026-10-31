import { ConsistencyClientError } from './consistency-client-error';
import { STALE_CHECK_FACTOR } from './consistency-types';
import type { ConsistencyHealth, ConsistencySummary } from './consistency-types';

export interface HealthVerdict {
    health: ConsistencyHealth;
    detail: string;
}

// Reasons that mean "the report cannot be trusted right now" and become a report-unavailable issue.
export function isUnavailable(health: ConsistencyHealth): boolean {
    return health !== 'ok' && health !== 'rate-limited';
}

export function healthFromError(err: ConsistencyClientError): HealthVerdict {
    switch (err.kind) {
        case 'unauthorized':
        case 'forbidden':
            return {
                health: 'unauthorized',
                detail: `Key rejected by the provider (${err.message})`,
            };
        case 'no-check-yet':
            return { health: 'no-check-yet', detail: 'The provider has not run a check yet' };
        case 'rate-limited':
            return {
                health: 'rate-limited',
                detail: `Rate limited (retry after ${err.retryAfterSeconds ?? '?'}s)`,
            };
        case 'unreachable':
        case 'server-error':
            return { health: 'unreachable', detail: `Provider unreachable: ${err.message}` };
        case 'bad-request':
        case 'malformed':
            return {
                health: 'invalid-response',
                detail: `Provider response rejected: ${err.message}`,
            };
    }
}

// A running check has finishedAt null, so the last known finish (or its start) is the reference.
export function evaluateSummary(
    summary: ConsistencySummary,
    previousFinishedAt: Date | null,
    checkIntervalMs: number,
    now: Date,
): HealthVerdict {
    const finished = summary.lastCheck.finishedAt;
    const reference =
        finished !== null
            ? new Date(finished)
            : (previousFinishedAt ?? new Date(summary.lastCheck.startedAt));
    const ageMs = now.getTime() - reference.getTime();
    if (ageMs > STALE_CHECK_FACTOR * checkIntervalMs) {
        return {
            health: 'stale',
            detail: `Last check finished ${Math.round(ageMs / 60_000)} min ago, schedule is ${Math.round(checkIntervalMs / 60_000)} min`,
        };
    }
    return { health: 'ok', detail: '' };
}
