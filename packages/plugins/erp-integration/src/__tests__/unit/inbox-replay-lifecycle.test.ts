import { describe, expect, it } from 'vitest';

import {
    REPLAY_WAIT_TIMEOUT_MS,
    expireDecision,
    replayDidNotResolve,
    timeoutReason,
} from '../../inbox-replay-lifecycle';

const base = new Date('2026-01-01T00:00:00Z');
const later = (ms: number) => new Date(base.getTime() + ms);
const state = (over: Partial<Parameters<typeof expireDecision>[0]> = {}) => ({
    replayRequestedAt: base,
    hasPendingNewerEvent: false,
    hasFailedNewerEvent: false,
    ...over,
});

describe('expireDecision', () => {
    it('waits before the timeout when nothing arrived yet', () => {
        expect(expireDecision(state(), later(REPLAY_WAIT_TIMEOUT_MS - 1))).toBeNull();
    });

    it('gives up at the timeout when no newer event exists', () => {
        expect(expireDecision(state(), later(REPLAY_WAIT_TIMEOUT_MS))).toBe('no-event-arrived');
    });

    it('keeps waiting past the timeout while the newer event is still pending/processing', () => {
        expect(
            expireDecision(
                state({ hasPendingNewerEvent: true }),
                later(REPLAY_WAIT_TIMEOUT_MS * 5),
            ),
        ).toBeNull();
    });

    it('gives up immediately when the newer event failed, even before the timeout', () => {
        expect(expireDecision(state({ hasFailedNewerEvent: true }), later(1))).toBe(
            'newer-event-failed',
        );
    });
});

describe('messages', () => {
    it('annotates the reason in one fixed prefix', () => {
        expect(replayDidNotResolve('x')).toBe('replay did not resolve: x');
        expect(timeoutReason('no-event-arrived', 3_600_000)).toContain('60 min');
        expect(timeoutReason('newer-event-failed', 1)).toBe('the replayed event failed');
    });
});
