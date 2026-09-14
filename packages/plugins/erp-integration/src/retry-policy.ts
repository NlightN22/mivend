import {
    MISSING_DEPENDENCY_RETRY_BASE_MS,
    MISSING_DEPENDENCY_RETRY_JITTER_RATIO,
    MISSING_DEPENDENCY_RETRY_MAX_MS,
} from './types';

// Pure decision extracted from IntegrationOutboxProcessorService so retry/dead-letter behavior
// is unit-testable without a DB or a mocked Kafka producer.
export function shouldDeadLetter(retryCountAfterThisFailure: number, maxRetry: number): boolean {
    return retryCountAfterThisFailure >= maxRetry;
}

// Pure decision extracted from IntegrationInboxService.markMissingDependency so the exponential
// backoff shape (issue #96) is unit-testable without a DB. `attemptsAfterThisFailure` is the
// row's `attempts` value AFTER incrementing for the current failure (1 on the first
// MissingDependencyError). `random` defaults to Math.random but is injectable so tests can assert
// the un-jittered sequence and the jitter bounds separately.
export function computeMissingDependencyBackoffMs(
    attemptsAfterThisFailure: number,
    random: () => number = Math.random,
): number {
    const exponent = Math.max(0, attemptsAfterThisFailure - 1);
    const raw = MISSING_DEPENDENCY_RETRY_BASE_MS * 2 ** exponent;
    const capped = Math.min(raw, MISSING_DEPENDENCY_RETRY_MAX_MS);
    // ±20% jitter: random() in [0,1) maps to a jitter factor in [1 - ratio, 1 + ratio).
    const jitterFactor = 1 + (random() * 2 - 1) * MISSING_DEPENDENCY_RETRY_JITTER_RATIO;
    return Math.round(capped * jitterFactor);
}
