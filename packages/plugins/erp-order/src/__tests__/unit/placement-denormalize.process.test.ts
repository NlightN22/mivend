import { describe, expect, it, vi } from 'vitest';
import type { Injector, Order, OrderState, RequestContext } from '@vendure/core';

import { placementDenormalizeProcess } from '../../placement-denormalize.process';

const denormalizePlacement = vi.fn();
const findUnroutableReason = vi.fn();
void placementDenormalizeProcess.init?.({
    get: () => ({ denormalizePlacement, findUnroutableReason }),
} as unknown as Injector);

const run = (from: OrderState, to: OrderState): Promise<unknown> | unknown =>
    placementDenormalizeProcess.onTransitionEnd?.(from, to, {
        ctx: {} as RequestContext,
        order: { id: 1 } as Order,
    });

describe('placementDenormalizeProcess (#258)', () => {
    it.each([
        ['AddingItems', 'ArrangingPayment'],
        ['Draft', 'ArrangingPayment'],
    ] as const)('denormalizes inside the %s -> %s transition', async (from, to) => {
        denormalizePlacement.mockClear();
        await run(from, to);
        expect(denormalizePlacement).toHaveBeenCalledTimes(1);
    });

    it('skips transitions that are not a placement', async () => {
        denormalizePlacement.mockClear();
        await run('ArrangingPayment', 'PaymentSettled');
        expect(denormalizePlacement).not.toHaveBeenCalled();
    });
});

describe('placementDenormalizeProcess onTransitionStart (#347)', () => {
    const start = (from: OrderState, to: OrderState) =>
        placementDenormalizeProcess.onTransitionStart?.(from, to, {
            ctx: {} as RequestContext,
            order: { id: 1 } as Order,
        });

    it('rejects the placement transition with the reason, before any allocation', async () => {
        findUnroutableReason.mockResolvedValue('No servicing branch');
        expect(await start('AddingItems', 'ArrangingPayment')).toBe('No servicing branch');
    });

    it('lets a routable order through', async () => {
        findUnroutableReason.mockResolvedValue(null);
        expect(await start('Draft', 'ArrangingPayment')).toBeUndefined();
    });

    it('does not check other transitions', async () => {
        findUnroutableReason.mockClear();
        await start('ArrangingPayment', 'AddingItems');
        await start('AddingItems', 'Cancelled');
        expect(findUnroutableReason).not.toHaveBeenCalled();
    });
});
