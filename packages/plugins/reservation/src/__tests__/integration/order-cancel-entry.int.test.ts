import { describe, expect, it } from 'vitest';
import { EntityNotFoundError } from '@vendure/core';
import type { RequestContext } from '@vendure/core';

import { OrderCancelEntryService } from '../../order-cancel-entry.service';
import { AdminCancelOrderResolver, ShopCancelOrderResolver } from '../../order-cancel.resolver';
import { TestCustomer, TestOrder, mockCtx, useReserveOrderHarness } from './reserve-order.harness';
import {
    buildCancellationFixture,
    loadOrder,
    seedCancellableOrder,
} from './order-cancellation.harness';

const h = useReserveOrderHarness('order_cancel_entry');

// Real resolvers, entry service, cancellation service and Postgres; the customer lookup and the
// visibility scope (branch-1 only) are the boundaries faked.
async function build() {
    await h.dataSource
        .getRepository(TestCustomer)
        .save([{ id: 'customer-1' }, { id: 'customer-2' }]);
    const f = buildCancellationFixture(h);
    const entry = new OrderCancelEntryService(
        h.connection,
        { findOneByUserId: async () => ({ id: 'customer-1' }) } as never,
        {
            buildVisibleOrdersQuery: async () =>
                h.dataSource
                    .getRepository(TestOrder)
                    .createQueryBuilder('o')
                    .where('o.customFields.branchId = :branch', { branch: 'branch-1' }),
        } as never,
        f.service,
    );
    return {
        shop: new ShopCancelOrderResolver(entry),
        admin: new AdminCancelOrderResolver(entry),
    };
}

describe('cancel mutations (real Postgres)', () => {
    it('shop cancelOrder cancels the customer own pending order', async () => {
        const { shop } = await build();
        const order = await seedCancellableOrder(h);

        const result = await shop.cancelOrder(mockCtx as RequestContext, { code: 'ORD-1' });

        expect(result).toEqual({ __typename: 'OrderCancelSuccess', outcome: 'CANCELLED' });
        expect((await loadOrder(h, order.id)).state).toBe('Cancelled');
    });

    it("shop cancelOrder of another customer's order is not found and changes nothing", async () => {
        const { shop } = await build();
        const order = await seedCancellableOrder(h);
        await h.dataSource.getRepository(TestOrder).update(order.id, { customerId: 'customer-2' });

        await expect(shop.cancelOrder(mockCtx, { code: 'ORD-1' })).rejects.toBeInstanceOf(
            EntityNotFoundError,
        );
        expect((await loadOrder(h, order.id)).state).toBe('PaymentAuthorized');
    });

    it('shop cancelOrder of an active cart is not found', async () => {
        const { shop } = await build();
        const order = await seedCancellableOrder(h, {}, 'AddingItems');
        await h.dataSource.getRepository(TestOrder).update(order.id, { active: true });

        await expect(shop.cancelOrder(mockCtx, { code: 'ORD-1' })).rejects.toBeInstanceOf(
            EntityNotFoundError,
        );
    });

    it('admin cancelOrderAsStaff cancels a visible order', async () => {
        const { admin } = await build();
        const order = await seedCancellableOrder(h);

        const result = await admin.cancelOrderAsStaff(mockCtx, { orderId: order.id });

        expect(result).toEqual({ __typename: 'OrderCancelSuccess', outcome: 'CANCELLED' });
    });

    it('admin cancelOrderAsStaff of an order outside the visibility scope is not found', async () => {
        const { admin } = await build();
        const order = await seedCancellableOrder(h, { branchId: 'branch-2' });

        await expect(
            admin.cancelOrderAsStaff(mockCtx, { orderId: order.id }),
        ).rejects.toBeInstanceOf(EntityNotFoundError);
        expect((await loadOrder(h, order.id)).state).toBe('PaymentAuthorized');
    });
});
