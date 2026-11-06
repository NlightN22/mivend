import { describe, expect, it, vi } from 'vitest';
import type { RequestContext, TransactionalConnection } from '@vendure/core';

import { OrderVisibilityAggregatesService } from '../../order-visibility-aggregates.service';
import type { OrderVisibilityService } from '../../order-visibility.service';

const ctx = {} as RequestContext;

function setup(): {
    service: OrderVisibilityAggregatesService;
    build: ReturnType<typeof vi.fn>;
} {
    const idsQb = {
        alias: 'order',
        select: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        getQuery: vi.fn(() => 'SELECT 1'),
        getParameters: vi.fn(() => ({})),
    };
    const build = vi.fn(async () => idsQb);
    const sumQb = {
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        getRawOne: vi.fn(async () => ({ sum: '42' })),
    };
    const service = new OrderVisibilityAggregatesService(
        { buildVisibleOrdersQuery: build } as unknown as OrderVisibilityService,
        {
            getRepository: () => ({ createQueryBuilder: () => sumQb }),
        } as unknown as TransactionalConnection,
    );
    return { service, build };
}

describe('OrderVisibilityAggregatesService', () => {
    it('sums over the filter only, never the caller paging or sort', async () => {
        const { service, build } = setup();
        const filter = { state: { eq: 'PaymentSettled' } };

        expect(await service.sumVisibleTotals(ctx, { take: 1, skip: 5, sort: {}, filter })).toBe(
            42,
        );

        expect(build).toHaveBeenCalledWith(ctx, { filter, filterOperator: undefined });
    });

    it('refuses more than 200 counterparty ids and answers an empty list without a query', async () => {
        const { service, build } = setup();

        await expect(
            service.lastOrderDates(
                ctx,
                Array.from({ length: 201 }, (_, i) => String(i)),
            ),
        ).rejects.toThrow('At most 200');
        expect(await service.lastOrderDates(ctx, [])).toEqual([]);
        expect(build).not.toHaveBeenCalled();
    });
});
