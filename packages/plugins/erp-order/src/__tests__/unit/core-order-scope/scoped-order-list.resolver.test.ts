import { describe, expect, it, vi } from 'vitest';
import { EntityNotFoundError } from '@vendure/core';
import type { RequestContext } from '@vendure/core';

import {
    ScopedCustomerOrdersResolver,
    ScopedOrderLineOrderResolver,
    ScopedOrdersResolver,
} from '../../../core-order-scope/scoped-order-list.resolver';

const ctx = (superAdmin: boolean) =>
    ({ userHasPermissions: () => superAdmin }) as unknown as RequestContext;

function deps(visible: string[] = []) {
    const visibility = {
        findVisible: vi.fn(async () => ({ items: [], totalItems: 0 })),
        visibleIds: vi.fn(
            async (_c: unknown, ids: unknown[]) =>
                new Set(ids.map(String).filter(id => visible.includes(id))),
        ),
    };
    const orderService = {
        findAll: vi.fn(async () => ({ items: [], totalItems: 0 })),
        findByCustomerId: vi.fn(async () => ({ items: [], totalItems: 0 })),
        findOneByOrderLineId: vi.fn(async () => ({ id: '2' })),
    };
    return { visibility, orderService };
}

describe('scoped core order lists', () => {
    it('orders returns only the visible orders', async () => {
        const { visibility, orderService } = deps();
        await new ScopedOrdersResolver(visibility as never, orderService as never).orders(
            ctx(false),
            { options: { take: 5 } },
            [],
        );
        expect(visibility.findVisible).toHaveBeenCalledWith(
            expect.anything(),
            { take: 5 },
            undefined,
            undefined,
            undefined,
            [],
        );
        expect(orderService.findAll).not.toHaveBeenCalled();
    });

    it('orders is unscoped for a superadmin', async () => {
        const { visibility, orderService } = deps();
        await new ScopedOrdersResolver(visibility as never, orderService as never).orders(
            ctx(true),
            {},
            [],
        );
        expect(orderService.findAll).toHaveBeenCalled();
        expect(visibility.findVisible).not.toHaveBeenCalled();
    });

    it('Customer.orders filters the visible orders by that customer', async () => {
        const { visibility, orderService } = deps();
        await new ScopedCustomerOrdersResolver(visibility as never, orderService as never).orders(
            ctx(false),
            { id: 7 } as never,
            {},
            [],
        );
        expect(visibility.findVisible).toHaveBeenCalledWith(
            expect.anything(),
            undefined,
            undefined,
            '7',
            undefined,
            [],
        );
    });

    it('OrderLine.order of a foreign order is not found, a visible one is returned', async () => {
        const foreign = deps();
        await expect(
            new ScopedOrderLineOrderResolver(
                foreign.visibility as never,
                foreign.orderService as never,
            ).order(ctx(false), { id: 'l2' } as never, []),
        ).rejects.toBeInstanceOf(EntityNotFoundError);
        const own = deps(['2']);
        await expect(
            new ScopedOrderLineOrderResolver(
                own.visibility as never,
                own.orderService as never,
            ).order(ctx(false), { id: 'l2' } as never, []),
        ).resolves.toEqual({ id: '2' });
    });
});
