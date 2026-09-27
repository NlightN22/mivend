import { INBOX_RETRY_BASE_MS, INBOX_RETRY_JITTER_RATIO, INBOX_RETRY_MAX_MS } from './types';

// Pure decision extracted from IntegrationOutboxProcessorService so retry/dead-letter behavior
// is unit-testable without a DB or a mocked Kafka producer.
export function shouldDeadLetter(retryCountAfterThisFailure: number, maxRetry: number): boolean {
    return retryCountAfterThisFailure >= maxRetry;
}

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
