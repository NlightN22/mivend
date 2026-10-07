import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { CreditFlagService } from '../../credit-flag.service';

const ctx = {} as RequestContext;

function visibleQuery(orders: unknown[]) {
    const qb = {
        alias: 'Order',
        andWhere: vi.fn().mockReturnThis(),
        getMany: vi.fn().mockResolvedValue(orders),
    };
    return qb;
}

describe('CreditFlagService.flaggedCounterpartyIds', () => {
    it('returns distinct counterparties of the scoped, flagged orders', async () => {
        const qb = visibleQuery([
            { customer: { customFields: { counterpartyId: '3' } } },
            { customer: { customFields: { counterpartyId: '3' } } },
            { customer: { customFields: { counterpartyId: '4' } } },
            { customer: { customFields: {} } },
        ]);
        const buildVisibleOrdersQuery = vi.fn().mockResolvedValue(qb);
        const service = new CreditFlagService({} as never, { buildVisibleOrdersQuery } as never);
        expect(await service.flaggedCounterpartyIds(ctx)).toEqual(['3', '4']);
        expect(buildVisibleOrdersQuery).toHaveBeenCalledWith(ctx, expect.objectContaining({}));
        expect(qb.andWhere).toHaveBeenCalledTimes(3);
    });

    it('returns nothing when no scoped order is flagged', async () => {
        const service = new CreditFlagService(
            {} as never,
            { buildVisibleOrdersQuery: async () => visibleQuery([]) } as never,
        );
        expect(await service.flaggedCounterpartyIds(ctx)).toEqual([]);
    });
});

describe('CreditFlagService.isOrderFlagged', () => {
    it.each([
        [1, true],
        [0, false],
    ])('is %s matching flagged payments -> %s', async (count, expected) => {
        const qb = {
            where: vi.fn().mockReturnThis(),
            andWhere: vi.fn().mockReturnThis(),
            getCount: vi.fn().mockResolvedValue(count),
        };
        const service = new CreditFlagService(
            { getRepository: () => ({ createQueryBuilder: () => qb }) } as never,
            {} as never,
        );
        expect(await service.isOrderFlagged(ctx, 9)).toBe(expected);
        expect(qb.where).toHaveBeenCalledWith('p."orderId" = :orderId', { orderId: 9 });
    });
});
