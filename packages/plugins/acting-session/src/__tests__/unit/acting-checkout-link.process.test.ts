import { describe, expect, it, vi } from 'vitest';

import { ActingCheckoutLinkProcess } from '../../acting-checkout-link.process';

function setup() {
    const update = vi.fn();
    const set = vi.fn();
    const repo = {
        update,
        createQueryBuilder: () => ({ relation: () => ({ of: () => ({ set }) }) }),
    };
    const process = new ActingCheckoutLinkProcess();
    process.init({
        get: (token: { name: string }) =>
            token.name === 'TransactionalConnection'
                ? { getRepository: () => repo }
                : { findOneByUserId: async () => ({ id: 'cu-1' }) },
    } as never);
    return { process, update, set };
}

const ctx = { activeUserId: 'user-1' } as never;

describe('ActingCheckoutLinkProcess', () => {
    it('links the acting cart to the session customer only when payment is arranged', async () => {
        const { process, update } = setup();
        const order = { id: 5, customFields: { actingSessionId: 's1' } } as never;

        await process.onTransitionStart('AddingItems', 'ArrangingPayment', { ctx, order });

        expect(update).toHaveBeenCalledWith(5, { customer: { id: 'cu-1' } });
        expect((order as { customerId: string }).customerId).toBe('cu-1');
    });

    it("unlinks the customer when checkout is left, so an abandoned cart is never the customer's", async () => {
        const { process, set } = setup();
        const order = {
            id: 5,
            customerId: 'cu-1',
            customFields: { actingSessionId: 's1' },
        } as never;

        await process.onTransitionStart('ArrangingPayment', 'AddingItems', { ctx, order });

        expect(set).toHaveBeenCalledWith(null);
    });

    it('does nothing for an ordinary customer cart', async () => {
        const { process, update, set } = setup();
        const order = { id: 6, customFields: {} } as never;

        await process.onTransitionStart('AddingItems', 'ArrangingPayment', { ctx, order });
        await process.onTransitionStart('ArrangingPayment', 'AddingItems', { ctx, order });

        expect(update).not.toHaveBeenCalled();
        expect(set).not.toHaveBeenCalled();
    });
});
