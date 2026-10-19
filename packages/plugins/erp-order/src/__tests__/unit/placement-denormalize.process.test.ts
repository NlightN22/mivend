import { describe, expect, it, vi } from 'vitest';
import type { Injector, Order, OrderState, RequestContext } from '@vendure/core';

import { placementDenormalizeProcess } from '../../placement-denormalize.process';

const denormalizePlacement = vi.fn();
void placementDenormalizeProcess.init?.({
    get: () => ({ denormalizePlacement }),
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
