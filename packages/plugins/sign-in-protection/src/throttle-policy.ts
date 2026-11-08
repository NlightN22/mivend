import type { ThrottleLimits } from './types';

export interface CounterState {
    failures: number;
    ageMs: number;
}

export function lockDurationMs(failures: number, limits: ThrottleLimits): number {
    if (failures < limits.threshold) return 0;
    const doublings = Math.min(failures - limits.threshold, 30);
    return Math.min(limits.maxLockMs, limits.baseLockMs * 2 ** doublings);
}

// A counter with no failure for resetAfterMs is dead; age is measured on the database clock.
export function liveFailures(state: CounterState | undefined, resetAfterMs: number): number {
    return state && state.ageMs < resetAfterMs ? state.failures : 0;
}

export function remainingLockMs(
    state: CounterState | undefined,
    limits: ThrottleLimits,
    resetAfterMs: number,
): number {
    if (!state || state.ageMs >= resetAfterMs) return 0;
    return Math.max(0, lockDurationMs(state.failures, limits) - state.ageMs);
}
