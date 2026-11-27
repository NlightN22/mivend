export type ComparisonState = 'in-sync' | 'seeding' | 'converging' | 'stalled';

export const STALLED_AFTER_FLAT_RUNS = 3;
export const SEEDING_ALARM_MS = 48 * 60 * 60 * 1000;
// Runs closer together than this (a manual run next to the timer) do not advance the flat-run counter.
export const MIN_ADVANCE_SPACING_MS = 60 * 60 * 1000;

// null is an unknown signal, never zero; undefined means the signal does not apply to the kind.
export interface ComparisonSignals {
    inboxBacklog: number | null;
    inboxFailed: number | null;
    sourceQueue: number | null | undefined;
}

export interface PreviousComparison {
    state: ComparisonState;
    gap: number;
    flatRuns: number;
    seedingSince: Date | null;
    lastRunAt: Date;
}

export interface ComparisonOutcome {
    state: ComparisonState;
    gap: number;
    flatRuns: number;
    seedingSince: Date | null;
    seedingAlarm: boolean;
    reason: string;
}

export function quietReason(signals: ComparisonSignals): string | null {
    if (signals.inboxBacklog === null || signals.inboxFailed === null) return 'inbox-unknown';
    if (signals.sourceQueue === null) return 'source-queue-unknown';
    if (signals.inboxBacklog > 0) return 'inbox-behind';
    if (signals.inboxFailed > 0) return 'inbox-errors';
    if (signals.sourceQueue !== undefined && signals.sourceQueue > 0) return 'source-queue';
    return null;
}

// gap = upstream minus local. Compared against what has been processed: a busy or unknown signal only records the gap.
export function nextComparison(input: {
    ourCount: number;
    theirCount: number;
    signals: ComparisonSignals;
    previous: PreviousComparison | null;
    now: Date;
}): ComparisonOutcome {
    const { signals, previous, now } = input;
    const gap = input.theirCount - input.ourCount;
    if (gap === 0) {
        return {
            state: 'in-sync',
            gap,
            flatRuns: 0,
            seedingSince: null,
            seedingAlarm: false,
            reason: 'equal',
        };
    }
    const advance =
        previous === null || now.getTime() - previous.lastRunAt.getTime() >= MIN_ADVANCE_SPACING_MS;
    const busy = quietReason(signals);
    const base = previous && previous.state !== 'in-sync' ? previous : null;
    const seedingSince = base?.seedingSince ?? now;
    const withAlarm = (
        o: Omit<ComparisonOutcome, 'seedingAlarm' | 'seedingSince'>,
    ): ComparisonOutcome => ({
        ...o,
        seedingSince,
        seedingAlarm: now.getTime() - seedingSince.getTime() > SEEDING_ALARM_MS,
    });

    if (busy !== null) {
        return withAlarm({ state: 'seeding', gap, flatRuns: 0, reason: busy });
    }
    if (previous === null || previous.state === 'in-sync') {
        return withAlarm({ state: 'seeding', gap, flatRuns: 0, reason: 'first-gap' });
    }
    if (!advance) {
        if (previous.state === 'stalled') {
            return {
                state: 'stalled',
                gap,
                flatRuns: previous.flatRuns,
                seedingSince: null,
                seedingAlarm: false,
                reason: 'too-soon',
            };
        }
        return withAlarm({
            state: previous.state,
            gap,
            flatRuns: previous.flatRuns,
            reason: 'too-soon',
        });
    }
    if (Math.abs(gap) < Math.abs(previous.gap)) {
        return withAlarm({ state: 'converging', gap, flatRuns: 0, reason: 'gap-shrank' });
    }
    const flatRuns = gap === previous.gap ? previous.flatRuns + 1 : 0;
    if (flatRuns >= STALLED_AFTER_FLAT_RUNS) {
        return {
            state: 'stalled',
            gap,
            flatRuns,
            seedingSince: null,
            seedingAlarm: false,
            reason: 'flat',
        };
    }
    return withAlarm({
        state: 'seeding',
        gap,
        flatRuns,
        reason: flatRuns > 0 ? 'flat-not-yet-stable' : 'gap-changed',
    });
}
