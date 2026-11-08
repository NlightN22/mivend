import { describe, expect, it } from 'vitest';

import { liveFailures, lockDurationMs, remainingLockMs } from '../../throttle-policy';

const limits = { threshold: 3, baseLockMs: 1000, maxLockMs: 8000 };

describe('lockDurationMs', () => {
    it('does not lock below the threshold', () => {
        expect(lockDurationMs(2, limits)).toBe(0);
    });
    it('starts at the base lock and doubles per further failure', () => {
        expect([3, 4, 5].map(n => lockDurationMs(n, limits))).toEqual([1000, 2000, 4000]);
    });
    it('is capped, so a lock is never permanent', () => {
        expect(lockDurationMs(50, limits)).toBe(8000);
        expect(lockDurationMs(1_000_000, limits)).toBe(8000);
    });
});

describe('remainingLockMs', () => {
    it('counts the lock from the last failure', () => {
        expect(remainingLockMs({ failures: 3, ageMs: 400 }, limits, 60_000)).toBe(600);
    });
    it('is zero once the lock elapsed or the counter expired', () => {
        expect(remainingLockMs({ failures: 3, ageMs: 1000 }, limits, 60_000)).toBe(0);
        expect(remainingLockMs({ failures: 9, ageMs: 60_000 }, limits, 60_000)).toBe(0);
        expect(remainingLockMs(undefined, limits, 60_000)).toBe(0);
    });
});

describe('liveFailures', () => {
    it('ignores an expired counter', () => {
        expect(liveFailures({ failures: 4, ageMs: 10 }, 100)).toBe(4);
        expect(liveFailures({ failures: 4, ageMs: 100 }, 100)).toBe(0);
    });
});
