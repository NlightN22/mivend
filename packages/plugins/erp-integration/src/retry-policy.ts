import {
    RETRY_BACKOFF_BASE_MS,
    RETRY_BACKOFF_JITTER_RATIO,
    RETRY_BACKOFF_MAX_MS,
    OUTBOX_RETRY_WALL_CLOCK_BUDGET_MS,
    PARKED_RETRY_MAX_MS,
} from './types';

// `attemptsAfterThisFailure` is 1 on the first failure; `random` is injectable for tests.
export function computeRetryBackoffMs(
    attemptsAfterThisFailure: number,
    random: () => number = Math.random,
): number {
    const exponent = Math.max(0, attemptsAfterThisFailure - 1);
    const raw = RETRY_BACKOFF_BASE_MS * 2 ** exponent;
    const capped = Math.min(raw, RETRY_BACKOFF_MAX_MS);
    // ±20% jitter: random() in [0,1) maps to a jitter factor in [1 - ratio, 1 + ratio).
    const jitterFactor = 1 + (random() * 2 - 1) * RETRY_BACKOFF_JITTER_RATIO;
    return Math.round(capped * jitterFactor);
}

export type OutboxFailureDecision = { status: 'failed' } | { status: 'pending'; nextRetryAt: Date };

// Same shape as the inbox policy: back off between attempts, dead-letter only once the wall-clock
// budget since the first failure is spent (a short broker outage must never drop events).
export function decideOutboxFailure(
    now: Date,
    firstFailedAt: Date,
    attemptsAfterThisFailure: number,
    random: () => number = Math.random,
): OutboxFailureDecision {
    if (now.getTime() - firstFailedAt.getTime() > OUTBOX_RETRY_WALL_CLOCK_BUDGET_MS) {
        return { status: 'failed' };
    }
    const backoffMs = computeRetryBackoffMs(attemptsAfterThisFailure, random);
    return { status: 'pending', nextRetryAt: new Date(now.getTime() + backoffMs) };
}

// A parked row retries after as long as it has been parked (30 min, then doubling), capped at 24 h.
export function computeParkedRetryDelayMs(parkedForMs: number): number {
    return Math.min(Math.max(parkedForMs, RETRY_BACKOFF_MAX_MS), PARKED_RETRY_MAX_MS);
}
