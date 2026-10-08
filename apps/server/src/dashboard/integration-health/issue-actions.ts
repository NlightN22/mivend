export interface ReplayResultLike {
    outcome: string;
    message?: string | null;
}

export function summarizeReplay(results: readonly ReplayResultLike[]): {
    ok: boolean;
    message: string;
} {
    const replayed = results.filter(r => r.outcome === 'REPLAYED').length;
    if (replayed === results.length && replayed > 0) {
        return {
            ok: true,
            message: `Replay requested for ${replayed} row(s); the entity will arrive again shortly.`,
        };
    }
    const first = results.find(r => r.outcome !== 'REPLAYED');
    const reason = first
        ? `${first.outcome}${first.message ? `: ${first.message}` : ''}`
        : 'nothing to replay';
    return { ok: false, message: `Replay did not run (${reason})` };
}

export function summarizeRequeue(count: number): { ok: boolean; message: string } {
    return count > 0
        ? { ok: true, message: `${count} event(s) returned to the publish queue.` }
        : { ok: false, message: 'Nothing was requeued: the row is no longer failed.' };
}

const REBUILD_MESSAGES: Record<string, { ok: boolean; message: string }> = {
    QUEUED: { ok: true, message: 'Event rebuilt and queued for publishing.' },
    STILL_SKIPPED: {
        ok: false,
        message: 'Still cannot be built; the reason on the row was updated.',
    },
    ALREADY_SENT: {
        ok: false,
        message: 'An event for this order already exists; nothing was queued.',
    },
};

export function summarizeRebuild(outcome: string): { ok: boolean; message: string } {
    return REBUILD_MESSAGES[outcome] ?? { ok: false, message: `Unexpected result: ${outcome}` };
}
