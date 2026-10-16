import { describe, expect, it } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { OrderLineShortfallService } from '../../order-line-shortfall.service';

const ctx = {} as RequestContext;

function build(visible: boolean) {
    const qb = {
        alias: 'o',
        andWhere: () => qb,
        getOne: async () => (visible ? { id: '5' } : null),
    };
    const shortfall = {
        id: 's1',
        orderId: '5',
        orderLineId: '10',
        productVariantId: '7',
        requestedQuantity: 5,
        keptQuantity: 2,
        shortfallQuantity: 3,
        limitedBy: 'organization',
        createdAt: new Date('2026-10-16T10:00:00Z'),
    };
    const find = { shortfallWhere: undefined as unknown };
    const connection = {
        getRepository: (_ctx: unknown, entity: { name: string }) => ({
            find: async (opts: { where: unknown }) => {
                if (entity.name === 'OrderLineShortfall') {
                    find.shortfallWhere = opts.where;
                    return [shortfall];
                }
                return [{ id: '7', sku: 'sku-7', name: 'Part 7' }];
            },
        }),
    };
    const visibility = { buildVisibleOrdersQuery: async () => qb };
    const service = new OrderLineShortfallService(connection as never, visibility as never);
    return { service, find };
}

describe('OrderLineShortfallService', () => {
    it('returns the order rows with the product sku and name', async () => {
        const { service, find } = build(true);
        const rows = await service.forOrder(ctx, '5');
        expect(find.shortfallWhere).toEqual({ orderId: '5' });
        expect(rows).toEqual([
            expect.objectContaining({
                orderLineId: '10',
                sku: 'sku-7',
                name: 'Part 7',
                shortfallQuantity: 3,
                limitedBy: 'organization',
            }),
        ]);
    });

    it('refuses an order outside the staff member visibility scope', async () => {
        const { service } = build(false);
        await expect(service.forOrder(ctx, '5')).rejects.toThrow('Order not found');
    });
});
