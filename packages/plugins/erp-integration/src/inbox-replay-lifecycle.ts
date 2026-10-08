// Replay lifecycle of a dead-lettered inbox row: failed -> replay_requested -> resolved | failed.
// A noop outcome closes the row too: it is a recorded, reasoned result for the replayed event.
export const REPLAY_WAIT_TIMEOUT_MS = 60 * 60 * 1000;

export type ReplayFailureCause = 'newer-event-failed' | 'no-event-arrived';

export function replayDidNotResolve(reason: string): string {
    return `replay did not resolve: ${reason}`;
}

export function timeoutReason(cause: ReplayFailureCause, timeoutMs: number): string {
    return cause === 'newer-event-failed'
        ? 'the replayed event failed'
        : `no replayed event was processed within ${Math.round(timeoutMs / 60000)} min`;
}

export interface ReplayWaitState {
    replayRequestedAt: Date;
    hasPendingNewerEvent: boolean;
    hasFailedNewerEvent: boolean;
}

export function expireDecision(
    state: ReplayWaitState,
    now: Date,
    timeoutMs: number = REPLAY_WAIT_TIMEOUT_MS,
): ReplayFailureCause | null {
    if (state.hasFailedNewerEvent) return 'newer-event-failed';
    if (state.hasPendingNewerEvent) return null;
    return now.getTime() - state.replayRequestedAt.getTime() >= timeoutMs
        ? 'no-event-arrived'
        : null;
}
