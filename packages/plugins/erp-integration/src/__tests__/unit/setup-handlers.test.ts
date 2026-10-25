import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { DiscountSetupStreamHandler } from '../../handlers/discount-setup.handler';
import { RetroBonusSetupStreamHandler } from '../../handlers/retro-bonus-setup.handler';

const ctx = {} as RequestContext;
const base = {
    version: '2',
    effectiveFrom: '2026-01-01T00:00:00Z',
    isActive: true,
    productMode: 'list',
};
const discount = { ...base, percent: 5, recipients: [{ counterpartyId: 'cp-1' }] };
const retro = { ...base, percent: 2, counterpartyMode: 'list' };

describe('DiscountSetupStreamHandler', () => {
    const run = async (result: string, payload: Record<string, unknown> = discount) => {
        const apply = vi.fn().mockResolvedValue(result);
        const handler = new DiscountSetupStreamHandler({ apply } as never);
        return { outcome: await handler.apply(ctx, 'doc-1', payload), apply };
    };

    it('reports an applied document and hands the parsed input to the service', async () => {
        const { outcome, apply } = await run('applied');
        expect(outcome).toEqual({ kind: 'applied' });
        expect(apply.mock.calls[0][1].setup).toMatchObject({ erpId: 'doc-1', percent: 5 });
    });

    it.each([
        ['stale', 'version does not beat'],
        ['unchanged', 'content unchanged'],
    ])('settles a %s redelivery as a noop with its reason', async (result, reason) => {
        const { outcome } = await run(result);
        expect(outcome).toMatchObject({ kind: 'noop' });
        expect((outcome as { reason: string }).reason).toContain(reason);
    });

    it('settles a document mivend cannot evaluate as a noop naming the reason', async () => {
        const { outcome } = await run('applied', { ...discount, priceNumber: 10 });
        expect(outcome).toMatchObject({ kind: 'noop' });
        expect((outcome as { reason: string }).reason).toContain('fixed-price');
    });

    it('deactivates on an unposted document and noops when the rule is unknown', async () => {
        const deactivate = vi
            .fn()
            .mockResolvedValueOnce('deactivated')
            .mockResolvedValueOnce('unknown');
        const handler = new DiscountSetupStreamHandler({ deactivate } as never);
        const payload = { ...discount, isActive: false };

        expect(await handler.apply(ctx, 'doc-1', payload)).toEqual({ kind: 'applied' });
        expect(await handler.apply(ctx, 'doc-1', payload)).toMatchObject({ kind: 'noop' });
        expect(deactivate).toHaveBeenCalledWith(ctx, 'doc-1', '2');
    });

    it('settles a tombstone older than the stored version as a noop', async () => {
        const deactivate = vi.fn().mockResolvedValue('stale');
        const handler = new DiscountSetupStreamHandler({ deactivate } as never);
        const outcome = await handler.apply(ctx, 'doc-1', { ...discount, isDeleted: true });
        expect(outcome).toMatchObject({ kind: 'noop' });
        expect((outcome as { reason: string }).reason).toContain('does not beat');
    });

    it('settles an unsupported operation as a noop naming it', async () => {
        const { outcome } = await run('unsupported-operation', {
            ...discount,
            operationKind: 'НатуральныеСкидки',
        });
        expect((outcome as { reason: string }).reason).toContain(
            'unsupported operation НатуральныеСкидки',
        );
    });

    it('notes an empty version on a stale tombstone', async () => {
        const deactivate = vi.fn().mockResolvedValue('stale');
        const handler = new DiscountSetupStreamHandler({ deactivate } as never);
        const outcome = await handler.apply(ctx, 'doc-1', {
            isDeleted: true,
            effectiveFrom: base.effectiveFrom,
        });
        expect((outcome as { reason: string }).reason).toContain('empty version');
    });

    it('settles a document with an unknown condition as a noop naming it', async () => {
        const { outcome } = await run('unknown-condition', { ...discount, condition: 'Mystery' });
        expect(outcome).toMatchObject({ kind: 'noop' });
        expect((outcome as { reason: string }).reason).toContain('unknown condition Mystery');
    });
});

describe('RetroBonusSetupStreamHandler', () => {
    const run = async (result: string) => {
        const apply = vi.fn().mockResolvedValue(result);
        const handler = new RetroBonusSetupStreamHandler({ apply } as never);
        return { outcome: await handler.apply(ctx, 'doc-2', retro), apply };
    };

    it('reports an applied document', async () => {
        const { outcome, apply } = await run('applied');
        expect(outcome).toEqual({ kind: 'applied' });
        expect(apply.mock.calls[0][1].rule).toMatchObject({ erpId: 'doc-2', percent: 2 });
    });

    it.each(['stale', 'unchanged'])('settles a %s redelivery as a noop', async result => {
        expect((await run(result)).outcome).toMatchObject({ kind: 'noop' });
    });

    it('returns a reason for a stored rule that a dynamic filter keeps from ever showing', async () => {
        const apply = vi.fn().mockResolvedValue('applied');
        const handler = new RetroBonusSetupStreamHandler({ apply } as never);
        const outcome = await handler.apply(ctx, 'doc-2', { ...retro, productMode: 'filter' });
        expect(outcome).toMatchObject({ kind: 'noop' });
    });

    it('settles a tombstone older than the stored version as a noop', async () => {
        const deactivate = vi.fn().mockResolvedValue('stale');
        const handler = new RetroBonusSetupStreamHandler({ deactivate } as never);
        const outcome = await handler.apply(ctx, 'doc-2', { ...retro, isDeleted: true });
        expect(outcome).toMatchObject({ kind: 'noop' });
    });
});
