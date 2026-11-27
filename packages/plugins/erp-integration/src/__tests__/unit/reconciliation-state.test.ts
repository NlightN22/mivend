import { describe, expect, it } from 'vitest';

import {
    MIN_ADVANCE_SPACING_MS,
    SEEDING_ALARM_MS,
    STALLED_AFTER_FLAT_RUNS,
    nextComparison,
} from '../../reconciliation-state';
import type {
    ComparisonOutcome,
    ComparisonSignals,
    PreviousComparison,
} from '../../reconciliation-state';

const T0 = new Date('2026-11-20T00:00:00Z');
const later = (ms: number): Date => new Date(T0.getTime() + ms);
const quiet: ComparisonSignals = { inboxBacklog: 0, inboxFailed: 0, sourceQueue: undefined };
const HOUR = 60 * 60 * 1000;

const prev = (over: Partial<PreviousComparison> = {}): PreviousComparison => ({
    state: 'seeding',
    gap: 10,
    flatRuns: 0,
    seedingSince: T0,
    lastRunAt: T0,
    ...over,
});

const run = (
    gap: number,
    previous: PreviousComparison | null,
    signals: ComparisonSignals = quiet,
    now = later(24 * HOUR),
): ComparisonOutcome =>
    nextComparison({ ourCount: 100, theirCount: 100 + gap, signals, previous, now });

describe('nextComparison', () => {
    it('equal counts are in sync and clear the seeding clock', () => {
        expect(run(0, prev())).toMatchObject({ state: 'in-sync', gap: 0, seedingSince: null });
    });

    it('a first gap only records and starts the seeding clock', () => {
        expect(run(10, null)).toMatchObject({ state: 'seeding', reason: 'first-gap' });
        expect(run(10, prev({ state: 'in-sync', gap: 0 }))).toMatchObject({ state: 'seeding' });
    });

    it.each([
        ['inbox behind', { ...quiet, inboxBacklog: 3 }, 'inbox-behind'],
        ['inbox errors', { ...quiet, inboxFailed: 1 }, 'inbox-errors'],
        ['source queue not empty', { ...quiet, sourceQueue: 5 }, 'source-queue'],
        ['unknown inbox backlog', { ...quiet, inboxBacklog: null }, 'inbox-unknown'],
        ['unknown inbox errors', { ...quiet, inboxFailed: null }, 'inbox-unknown'],
        ['unknown source queue', { ...quiet, sourceQueue: null }, 'source-queue-unknown'],
    ])('%s keeps the kind seeding even when the gap is flat', (_n, signals, reason) => {
        const out = run(10, prev({ flatRuns: 5 }), signals);
        expect(out).toMatchObject({ state: 'seeding', flatRuns: 0, reason });
    });

    it('an unknown source queue is not the same as an empty one', () => {
        expect(run(10, prev({ flatRuns: 9 }), { ...quiet, sourceQueue: 0 }).state).toBe('stalled');
        expect(run(10, prev({ flatRuns: 9 }), { ...quiet, sourceQueue: null }).state).toBe(
            'seeding',
        );
    });

    it('a shrinking gap is converging and resets the flat counter', () => {
        expect(run(4, prev({ flatRuns: 2 }))).toMatchObject({ state: 'converging', flatRuns: 0 });
        expect(run(-4, prev({ gap: 10, flatRuns: 2 })).state).toBe('converging');
    });

    it('a flat gap becomes stalled only after the configured number of flat runs', () => {
        let p = prev();
        for (let i = 1; i < STALLED_AFTER_FLAT_RUNS; i += 1) {
            const out = run(10, p, quiet, later((i + 1) * 24 * HOUR));
            expect(out.state).toBe('seeding');
            p = { ...p, flatRuns: out.flatRuns, lastRunAt: later((i + 1) * 24 * HOUR) };
        }
        expect(run(10, p, quiet, later(10 * 24 * HOUR))).toMatchObject({
            state: 'stalled',
            seedingSince: null,
            seedingAlarm: false,
        });
    });

    it('a gap that changed without shrinking restarts the flat count', () => {
        expect(run(12, prev({ flatRuns: 2 }))).toMatchObject({ state: 'seeding', flatRuns: 0 });
    });

    it('runs closer than the spacing do not advance the counter', () => {
        const soon = later(MIN_ADVANCE_SPACING_MS - 1);
        expect(run(10, prev({ flatRuns: 1 }), quiet, soon)).toMatchObject({
            state: 'seeding',
            flatRuns: 1,
            reason: 'too-soon',
        });
        expect(run(10, prev({ state: 'stalled', flatRuns: 3 }), quiet, soon)).toMatchObject({
            state: 'stalled',
            flatRuns: 3,
        });
    });

    it('raises the seeding alarm only after 48 hours of seeding or converging', () => {
        const busy = { ...quiet, inboxBacklog: 1 };
        expect(run(10, prev(), busy, later(SEEDING_ALARM_MS)).seedingAlarm).toBe(false);
        expect(run(10, prev(), busy, later(SEEDING_ALARM_MS + 1)).seedingAlarm).toBe(true);
        const converging = run(4, prev(), quiet, later(SEEDING_ALARM_MS + HOUR));
        expect(converging).toMatchObject({ state: 'converging', seedingAlarm: true });
    });

    it('a stalled kind carries no seeding alarm', () => {
        const out = run(10, prev({ flatRuns: 9 }), quiet, later(SEEDING_ALARM_MS * 3));
        expect(out).toMatchObject({ state: 'stalled', seedingAlarm: false });
    });
});
