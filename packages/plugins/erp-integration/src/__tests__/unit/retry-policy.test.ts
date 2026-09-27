import { describe, expect, it } from 'vitest';

import { computeInboxRetryBackoffMs, shouldDeadLetter } from '../../retry-policy';

describe('shouldDeadLetter', () => {
    it('does not dead-letter while attempts remain below the limit', () => {
        expect(shouldDeadLetter(1, 5)).toBe(false);
        expect(shouldDeadLetter(4, 5)).toBe(false);
    });

    it('dead-letters once attempts reach the limit', () => {
        expect(shouldDeadLetter(5, 5)).toBe(true);
    });

    it('dead-letters if somehow already past the limit (no infinite retry)', () => {
        expect(shouldDeadLetter(6, 5)).toBe(true);
    });
});

// Issue #96: MissingDependencyError's own backoff shape — base 30s, doubling per attempt, capped
// at 30 minutes, ±20% jitter. `random` is pinned to 0.5 (jitterFactor === 1) below to assert the
// exact un-jittered sequence; the jitter bounds are asserted separately.
describe('computeInboxRetryBackoffMs', () => {
    const noJitter = (): number => 0.5;

    it('follows the 30s/1m/2m/4m/8m/16m/30m-cap sequence with no jitter', () => {
        expect(computeInboxRetryBackoffMs(1, noJitter)).toBe(30_000);
        expect(computeInboxRetryBackoffMs(2, noJitter)).toBe(60_000);
        expect(computeInboxRetryBackoffMs(3, noJitter)).toBe(120_000);
        expect(computeInboxRetryBackoffMs(4, noJitter)).toBe(240_000);
        expect(computeInboxRetryBackoffMs(5, noJitter)).toBe(480_000);
        expect(computeInboxRetryBackoffMs(6, noJitter)).toBe(960_000);
        expect(computeInboxRetryBackoffMs(7, noJitter)).toBe(30 * 60_000);
    });

    it('stays capped at 30 minutes for attempts far beyond the cap', () => {
        expect(computeInboxRetryBackoffMs(20, noJitter)).toBe(30 * 60_000);
    });

    it('applies up to +20% jitter at random() -> 1', () => {
        expect(computeInboxRetryBackoffMs(1, () => 1)).toBe(36_000);
    });

    it('applies up to -20% jitter at random() -> 0', () => {
        expect(computeInboxRetryBackoffMs(1, () => 0)).toBe(24_000);
    });

    it('never exceeds the 30-minute cap even with +20% jitter at the cap', () => {
        // The cap itself is applied before jitter (per the "capped at 30 minutes per individual
        // retry gap" spec) — jitter can still push the final delay slightly past the raw cap.
        expect(computeInboxRetryBackoffMs(20, () => 1)).toBe(30 * 60_000 * 1.2);
    });
});
