import {
    INBOX_RETRY_BASE_MS,
    INBOX_RETRY_JITTER_RATIO,
    INBOX_RETRY_MAX_MS,
    OUTBOX_RETRY_WALL_CLOCK_BUDGET_MS,
} from './types';

// `attemptsAfterThisFailure` is 1 on the first failure; `random` is injectable for tests.
export function computeInboxRetryBackoffMs(
    attemptsAfterThisFailure: number,
    random: () => number = Math.random,
): number {
    const exponent = Math.max(0, attemptsAfterThisFailure - 1);
    const raw = INBOX_RETRY_BASE_MS * 2 ** exponent;
    const capped = Math.min(raw, INBOX_RETRY_MAX_MS);
    // ±20% jitter: random() in [0,1) maps to a jitter factor in [1 - ratio, 1 + ratio).
    const jitterFactor = 1 + (random() * 2 - 1) * INBOX_RETRY_JITTER_RATIO;
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
    const backoffMs = computeInboxRetryBackoffMs(attemptsAfterThisFailure, random);
    return { status: 'pending', nextRetryAt: new Date(now.getTime() + backoffMs) };
}
