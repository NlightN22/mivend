import { describe, expect, it } from 'vitest';

import {
    HEAL_BATCH_SIZE,
    HEAL_MAX_ATTEMPTS,
    HEAL_RETRY_AFTER_MS,
    attemptsAfterComparison,
    checkBatch,
    decideHeal,
    isAlarmOutcome,
    toBatches,
} from '../../reconciliation-heal-policy';

const NOW = new Date('2026-11-20T12:00:00Z');
const base = {
    state: 'stalled' as const,
    gap: 5,
    attempts: 0,
    lastRequestedAt: null,
    now: NOW,
    healKeyConfigured: false,
};

describe('decideHeal', () => {
    it('heals only from stalled', () => {
        for (const state of ['in-sync', 'seeding', 'converging'] as const) {
            expect(decideHeal({ ...base, state })).toEqual({ heal: false, reason: 'not-stalled' });
        }
    });

    it('never heals a gap where our side is higher', () => {
        expect(decideHeal({ ...base, gap: -2 })).toEqual({ heal: false, reason: 'local-higher' });
    });

    it('is a dry run without the heal key and a real run with it', () => {
        expect(decideHeal(base)).toEqual({ heal: true, realRun: false });
        expect(decideHeal({ ...base, healKeyConfigured: true })).toEqual({
            heal: true,
            realRun: true,
        });
    });

    it('waits the retry delay after a request', () => {
        const recent = new Date(NOW.getTime() - HEAL_RETRY_AFTER_MS + 1);
        expect(decideHeal({ ...base, lastRequestedAt: recent })).toEqual({
            heal: false,
            reason: 'too-soon',
        });
        const old = new Date(NOW.getTime() - HEAL_RETRY_AFTER_MS);
        expect(decideHeal({ ...base, lastRequestedAt: old }).heal).toBe(true);
    });

    it('stops after the maximum number of failed attempts', () => {
        expect(decideHeal({ ...base, attempts: HEAL_MAX_ATTEMPTS })).toEqual({
            heal: false,
            reason: 'attempts-exhausted',
        });
    });
});

describe('toBatches', () => {
    it('splits into batches of at most the batch size', () => {
        const ids = Array.from({ length: HEAL_BATCH_SIZE * 2 + 1 }, (_, i) => `id-${i}`);
        expect(toBatches(ids).map(b => b.length)).toEqual([HEAL_BATCH_SIZE, HEAL_BATCH_SIZE, 1]);
        expect(toBatches([])).toEqual([]);
    });
});

describe('checkBatch', () => {
    const sent = ['a', 'b', 'c'];
    const answer = (...s: string[]): Array<{ entityId: string; status: string }> =>
        sent.map((entityId, i) => ({ entityId, status: s[i] }));

    it('tallies a real run', () => {
        expect(checkBatch(sent, answer('republished', 'republished', 'not_found'), false)).toEqual({
            ok: true,
            tally: { republished: 2, wouldRepublish: 0, notFound: ['c'] },
        });
    });

    it('tallies a dry run', () => {
        const out = checkBatch(sent, answer('would_republish', 'not_found', 'not_found'), true);
        expect(out).toEqual({
            ok: true,
            tally: { republished: 0, wouldRepublish: 1, notFound: ['b', 'c'] },
        });
    });

    it('stops when the platform republished during a dry run', () => {
        expect(checkBatch(sent, answer('republished', 'not_found', 'not_found'), true)).toEqual({
            ok: false,
            reason: 'dry-run-ignored',
        });
    });

    it('stops on an unknown status or a would_republish outside a dry run', () => {
        expect(checkBatch(sent, answer('queued', 'not_found', 'not_found'), false)).toEqual({
            ok: false,
            reason: 'unknown-status',
        });
        expect(
            checkBatch(sent, answer('would_republish', 'not_found', 'not_found'), false).ok,
        ).toBe(false);
    });

    it('stops when the answered id set differs from the sent one', () => {
        const other = [
            { entityId: 'a', status: 'republished' },
            { entityId: 'x', status: 'republished' },
            { entityId: 'c', status: 'republished' },
        ];
        expect(checkBatch(sent, other, false)).toEqual({ ok: false, reason: 'id-set-mismatch' });
        expect(
            checkBatch(
                sent,
                answer('republished', 'republished', 'republished').slice(0, 2),
                false,
            ),
        ).toEqual({
            ok: false,
            reason: 'id-set-mismatch',
        });
    });
});

describe('isAlarmOutcome', () => {
    it('alarms on a platform that ignored the dry run, on all not_found, and on exhausted attempts', () => {
        expect(isAlarmOutcome('dry-run-ignored', 1)).toBe(true);
        expect(isAlarmOutcome('all-not-found', 1)).toBe(true);
        expect(isAlarmOutcome('batch-failed', HEAL_MAX_ATTEMPTS)).toBe(true);
        expect(isAlarmOutcome('batch-failed', 1)).toBe(false);
        expect(isAlarmOutcome('dry-run-only', 0)).toBe(false);
    });
});

describe('attemptsAfterComparison', () => {
    const t0 = new Date('2026-01-01T00:00:00Z');
    const t1 = new Date('2026-01-01T06:00:00Z');
    const base = {
        attempts: 0,
        healOutcome: 'healed' as const,
        healRequestedAt: t1,
        lastRunAt: t0,
        previousGap: 10,
        newGap: 10,
    };

    it('counts a heal that left the gap flat as a failed attempt', () => {
        expect(attemptsAfterComparison(base)).toBe(1);
    });

    it('stops the heal loop after the maximum attempts when the same ids stay missing', () => {
        let attempts = 0;
        for (let run = 0; run < HEAL_MAX_ATTEMPTS; run += 1) {
            attempts = attemptsAfterComparison({ ...base, attempts });
        }
        const decision = decideHeal({
            state: 'stalled',
            gap: 10,
            attempts,
            lastRequestedAt: t1,
            now: new Date(t1.getTime() + HEAL_RETRY_AFTER_MS),
            healKeyConfigured: true,
        });
        expect(decision).toEqual({ heal: false, reason: 'attempts-exhausted' });
    });

    it('resets attempts when the gap shrank', () => {
        expect(attemptsAfterComparison({ ...base, attempts: 2, newGap: 4 })).toBe(0);
    });

    it('leaves attempts alone when no real heal ran since the last comparison', () => {
        expect(attemptsAfterComparison({ ...base, attempts: 2, healRequestedAt: t0 })).toBe(2);
        expect(attemptsAfterComparison({ ...base, attempts: 2, healOutcome: 'dry-run-only' })).toBe(
            2,
        );
    });
});
