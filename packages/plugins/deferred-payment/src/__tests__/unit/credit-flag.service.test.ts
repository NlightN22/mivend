import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { CreditFlagService } from '../../credit-flag.service';

const ctx = {} as RequestContext;

function visibleQuery(rows: unknown[]) {
    return {
        alias: 'Order',
        select: vi.fn().mockReturnThis(),
        distinct: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        getRawMany: vi.fn().mockResolvedValue(rows),
    };
}

function serviceWith(qb: ReturnType<typeof visibleQuery>): CreditFlagService {
    return new CreditFlagService({} as never, { buildVisibleOrdersQuery: async () => qb } as never);
}

describe('CreditFlagService.flaggedCounterpartyIds', () => {
    it('selects distinct counterparty ids of the scoped, flagged orders', async () => {
        const qb = visibleQuery([{ counterpartyId: '3' }, { counterpartyId: '4' }]);
        expect(await serviceWith(qb).flaggedCounterpartyIds(ctx)).toEqual(['3', '4']);
        expect(qb.distinct).toHaveBeenCalledWith(true);
        expect(qb.limit).toHaveBeenCalledWith(5001);
        expect(qb.andWhere).toHaveBeenCalledTimes(4);
    });

    it('passes at the counterparty ceiling and fails one over, never truncating', async () => {
        const run = (count: number) =>
            serviceWith(
                visibleQuery(Array.from({ length: count }, (_, i) => ({ counterpartyId: `${i}` }))),
            ).flaggedCounterpartyIds(ctx);
        await expect(run(5000)).resolves.toHaveLength(5000);
        await expect(run(5001)).rejects.toMatchObject({
            extensions: { code: 'QUERY_TOO_LARGE' },
        });
    });

    it('returns nothing when no scoped order is flagged', async () => {
        expect(await serviceWith(visibleQuery([])).flaggedCounterpartyIds(ctx)).toEqual([]);
    });
});

describe('CreditFlagService.isOrderFlagged', () => {
    it('answers every order of one request with a single query', async () => {
        const qb = {
            select: vi.fn().mockReturnThis(),
            distinct: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            andWhere: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            getRawMany: vi.fn().mockResolvedValue([{ orderId: 9 }]),
        };
        const service = new CreditFlagService(
            { getRepository: () => ({ createQueryBuilder: () => qb }) } as never,
            {} as never,
        );
        const request = {} as RequestContext;
        const flags = await Promise.all([9, 10, 11].map(id => service.isOrderFlagged(request, id)));
        expect(flags).toEqual([true, false, false]);
        expect(qb.getRawMany).toHaveBeenCalledTimes(1);
        expect(qb.where).toHaveBeenCalledWith('p."orderId" IN (:...orderIds)', {
            orderIds: [9, 10, 11],
        });
    });

    it('fails when the read returns more rows than keys asked for', async () => {
        const qb = {
            select: vi.fn().mockReturnThis(),
            distinct: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            andWhere: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            getRawMany: vi.fn().mockResolvedValue([{ orderId: 9 }, { orderId: 10 }]),
        };
        const service = new CreditFlagService(
            { getRepository: () => ({ createQueryBuilder: () => qb }) } as never,
            {} as never,
        );
        await expect(service.isOrderFlagged({} as RequestContext, 9)).rejects.toMatchObject({
            extensions: { code: 'QUERY_TOO_LARGE' },
        });
        expect(qb.limit).toHaveBeenCalledWith(2);
    });
});
