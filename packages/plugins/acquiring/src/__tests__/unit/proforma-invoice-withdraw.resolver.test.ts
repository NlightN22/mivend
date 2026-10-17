import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { ProformaInvoiceAdminResolver } from '../../proforma-invoice.resolver';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- vitest Mock generics
function build(orderState: string) {
    const qb = {
        alias: 'order',
        andWhere: vi.fn().mockReturnThis(),
        getOne: vi.fn(async () => ({ id: 7, state: orderState })),
    };
    const withdraw = vi.fn(async () => ({ id: 3, status: 'cancelled' }));
    const close = vi.fn(async () => undefined);
    const resolver = new ProformaInvoiceAdminResolver(
        { findOne: vi.fn(async () => ({ id: 3, orderId: 7 })) } as never,
        {} as never,
        { buildVisibleOrdersQuery: async () => qb } as never,
        { withdraw } as never,
        { findOneByUserId: vi.fn() } as never,
        { closeForCancelledOrder: close } as never,
    );
    return { resolver, withdraw, close };
}

describe('withdrawProformaInvoice', () => {
    it('closes through the order-cancel path when the order is already cancelled', async () => {
        const { resolver, withdraw, close } = build('Cancelled');
        await resolver.withdrawProformaInvoice({} as RequestContext, { id: '3' });
        expect(close).toHaveBeenCalledWith({}, 7);
        expect(withdraw).not.toHaveBeenCalled();
    });

    it('keeps the manual withdraw rules on a live order', async () => {
        const { resolver, withdraw, close } = build('PaymentSettled');
        await resolver.withdrawProformaInvoice({} as RequestContext, { id: '3' });
        expect(withdraw).toHaveBeenCalled();
        expect(close).not.toHaveBeenCalled();
    });
});
