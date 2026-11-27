import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { ReconciliationHealService } from '../../reconciliation-heal.service';
import { ReplayRateLimitedError } from '../../resync-replay.client';

type ReplayDocuments = (
    kind: string,
    batch: string[],
    dryRun: boolean,
    apiKey?: string,
) => Promise<Array<{ entityId: string; status: string }>>;

const ctx = {} as never;
const ids = (n: number): string[] =>
    Array.from({ length: n }, (_, i) => `id-${String(i).padStart(4, '0')}`);

interface Harness {
    service: ReconciliationHealService;
    states: Record<'claimHeal' | 'knownNotFound' | 'rememberNotFound' | 'finishHeal', Mock>;
    diff: { missingIds: Mock };
    replay: { replayDocuments: Mock<ReplayDocuments>; replay: Mock };
    localIds: { idPage: Mock };
}

function setup(
    opts: {
        key?: string;
        missing?: string[];
        known?: string[];
        ourIds?: string[];
        row?: { healAttempts: number };
    } = {},
): Harness {
    const states = {
        claimHeal: vi.fn(async (_c: unknown, _t: string, _n: Date, key: boolean) => ({
            heal: true,
            realRun: key,
        })),
        knownNotFound: vi.fn(async () => new Set(opts.known ?? [])),
        rememberNotFound: vi.fn(async () => undefined),
        finishHeal: vi.fn(async () => opts.row ?? { healAttempts: 0 }),
    };
    const localIds = { idPage: vi.fn(async () => opts.ourIds ?? ['ours-1']) };
    const diff = { missingIds: vi.fn(async () => opts.missing ?? ids(3)) };
    const replay = {
        replayDocuments: vi.fn<ReplayDocuments>(async (_k, batch, dry) =>
            batch.map(entityId => ({ entityId, status: dry ? 'would_republish' : 'republished' })),
        ),
        replay: vi.fn(),
    };
    const service = new ReconciliationHealService(
        { reconciliationHealApiKey: opts.key } as never,
        states as never,
        localIds as never,
        diff as never,
        replay as never,
    );
    vi.spyOn(service as unknown as { pause: () => Promise<void> }, 'pause').mockResolvedValue();
    return { service, states, diff, replay, localIds };
}

const finished = (s: Harness): Record<string, unknown> =>
    (s.states.finishHeal.mock.calls[0] as unknown[])[2] as Record<string, unknown>;

describe('ReconciliationHealService', () => {
    beforeEach(() => vi.clearAllMocks());

    it('without the heal key sends one dry-run batch and republishes nothing', async () => {
        const s = setup({ missing: ids(450) });
        const report = await s.service.healIfDue(ctx, 'customer-order');
        expect(report.outcome).toBe('dry-run-only');
        expect(s.replay.replayDocuments).toHaveBeenCalledTimes(1);
        expect(s.replay.replayDocuments.mock.calls[0][2]).toBe(true);
        expect(finished(s)).toMatchObject({
            outcome: 'dry-run-only',
            realRun: false,
            success: false,
        });
    });

    it('with the heal key republishes in sequential batches of 200 using that key', async () => {
        const s = setup({ key: 'heal-key', missing: ids(450) });
        const report = await s.service.healIfDue(ctx, 'customer-order');
        expect(report.outcome).toBe('healed');
        const real = s.replay.replayDocuments.mock.calls.filter(c => c[2] === false);
        expect(real.map(c => c[1].length)).toEqual([200, 200, 50]);
        expect(real.every(c => c[3] === 'heal-key')).toBe(true);
        expect(finished(s)).toMatchObject({ outcome: 'healed', success: true, realRun: true });
    });

    it('caps the ids of one run', async () => {
        const s = setup({ key: 'k', missing: ids(5000) });
        await s.service.healIfDue(ctx, 'customer-order');
        const sent = s.replay.replayDocuments.mock.calls
            .filter(c => c[2] === false)
            .flatMap(c => c[1]);
        expect(sent).toHaveLength(2000);
    });

    it('does not ask again for ids already remembered as not found', async () => {
        const s = setup({ key: 'k', missing: ['a', 'b', 'c'], known: ['b'] });
        await s.service.healIfDue(ctx, 'customer-order');
        expect(s.replay.replayDocuments.mock.calls[1][1]).toEqual(['a', 'c']);
    });

    it('does nothing when every missing id is already explained', async () => {
        const s = setup({ key: 'k', missing: ['a'], known: ['a'] });
        expect((await s.service.healIfDue(ctx, 'customer-order')).outcome).toBe('nothing-missing');
        expect(s.replay.replayDocuments).not.toHaveBeenCalled();
    });

    it('stops with an alarm when the platform republished during the dry run', async () => {
        const s = setup({ key: 'k' });
        s.replay.replayDocuments.mockImplementation(async (_k, batch) =>
            batch.map(entityId => ({ entityId, status: 'republished' })),
        );
        const report = await s.service.healIfDue(ctx, 'customer-order');
        expect(report).toMatchObject({ outcome: 'dry-run-ignored', alarm: true });
        expect(s.replay.replayDocuments).toHaveBeenCalledTimes(1);
        expect(finished(s)).toMatchObject({ success: false });
    });

    it('stops at the first failed batch', async () => {
        const s = setup({ key: 'k', missing: ids(450) });
        s.replay.replayDocuments.mockImplementation(async (_k, batch, dry) => {
            if (!dry && batch[0] === 'id-0200') throw new Error('Replay endpoint returned 500');
            return batch.map(entityId => ({
                entityId,
                status: dry ? 'would_republish' : 'republished',
            }));
        });
        const report = await s.service.healIfDue(ctx, 'customer-order');
        expect(report.outcome).toBe('batch-failed');
        expect(s.replay.replayDocuments.mock.calls.filter(c => c[2] === false)).toHaveLength(2);
        expect(finished(s)).toMatchObject({ outcome: 'batch-failed', success: false });
    });

    it('remembers not_found ids and alarms when nothing was republished', async () => {
        const s = setup({ key: 'k', missing: ['a', 'b'] });
        s.replay.replayDocuments.mockImplementation(async (_k, batch, dry) =>
            batch.map(entityId => ({ entityId, status: dry ? 'would_republish' : 'not_found' })),
        );
        const report = await s.service.healIfDue(ctx, 'customer-order');
        expect(s.states.rememberNotFound).toHaveBeenCalledWith(ctx, 'customer-order', ['a', 'b']);
        expect(report).toMatchObject({ outcome: 'all-not-found', alarm: true });
    });

    it('stops when the answer holds a different id set', async () => {
        const s = setup({ key: 'k', missing: ['a', 'b'] });
        s.replay.replayDocuments.mockResolvedValue([
            { entityId: 'a', status: 'would_republish' },
            { entityId: 'z', status: 'would_republish' },
        ]);
        expect((await s.service.healIfDue(ctx, 'customer-order')).outcome).toBe('id-set-mismatch');
    });

    it('retries a rate-limited batch up to three times, then fails', async () => {
        const s = setup({ key: 'k', missing: ['a'] });
        s.replay.replayDocuments.mockRejectedValue(new ReplayRateLimitedError());
        expect((await s.service.healIfDue(ctx, 'customer-order')).outcome).toBe('batch-failed');
        expect(s.replay.replayDocuments).toHaveBeenCalledTimes(4);
    });

    it('recovers after one rate-limited answer', async () => {
        const s = setup({ missing: ['a'] });
        s.replay.replayDocuments
            .mockRejectedValueOnce(new ReplayRateLimitedError())
            .mockImplementation(async (_k, batch) =>
                batch.map(entityId => ({ entityId, status: 'would_republish' })),
            );
        expect((await s.service.healIfDue(ctx, 'customer-order')).outcome).toBe('dry-run-only');
    });

    it('reports an aggregate without an id source instead of guessing', async () => {
        const s = setup({ key: 'k' });
        expect((await s.service.healIfDue(ctx, 'unit')).outcome).toBe('no-id-source');
        expect(s.diff.missingIds).not.toHaveBeenCalled();
    });

    it('walks our ids in windows and sends each window with its bounds', async () => {
        const s = setup({ missing: [] });
        s.localIds.idPage.mockResolvedValueOnce(ids(50_000)).mockResolvedValueOnce(['tail']);
        await s.service.healIfDue(ctx, 'customer-order');
        expect((s.diff.missingIds.mock.calls[0] as unknown[])[2]).toEqual({ untilId: 'id-49999' });
        expect((s.diff.missingIds.mock.calls[1] as unknown[])[2]).toEqual({ afterId: 'id-49999' });
    });

    it('does nothing when the claim is refused', async () => {
        const s = setup();
        s.states.claimHeal.mockResolvedValue({ heal: false, reason: 'too-soon' } as never);
        expect(await s.service.healIfDue(ctx, 'customer-order')).toMatchObject({
            outcome: 'skipped',
            alarm: false,
        });
        expect(s.states.finishHeal).not.toHaveBeenCalled();
        s.states.claimHeal.mockResolvedValue({
            heal: false,
            reason: 'attempts-exhausted',
        } as never);
        expect((await s.service.healIfDue(ctx, 'customer-order')).alarm).toBe(true);
    });
});
