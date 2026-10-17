import { describe, expect, it } from 'vitest';
import type { Injector, Order, RequestContext } from '@vendure/core';

import { proformaInvoiceCancelProcess } from '../../proforma-invoice-cancel.process';

async function run(toState: string): Promise<number[]> {
    const closed: number[] = [];
    proformaInvoiceCancelProcess.init?.({
        get: () => ({
            closeForCancelledOrder: async (_ctx: RequestContext, orderId: number) => {
                closed.push(orderId);
            },
        }),
    } as unknown as Injector);
    await proformaInvoiceCancelProcess.onTransitionEnd?.('PaymentSettled', toState as never, {
        ctx: {} as RequestContext,
        order: { id: '42', code: '1000042' } as unknown as Order,
    });
    return closed;
}

describe('proformaInvoiceCancelProcess', () => {
    it('closes the proformas of an order entering Cancelled', async () => {
        expect(await run('Cancelled')).toEqual([42]);
    });

    it('does nothing on any other transition', async () => {
        expect(await run('PaymentSettled')).toEqual([]);
    });
});
