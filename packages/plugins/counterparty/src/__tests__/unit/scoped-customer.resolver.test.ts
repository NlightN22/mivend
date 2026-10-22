import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CustomerService, ListQueryBuilder, RequestContext } from '@vendure/core';
import type { AccessScopeService } from '@mivend/plugin-access-control';

import type { CounterpartyService } from '../../counterparty.service';
import { ScopedCustomerResolver } from '../../scoped-customer.resolver';

const ctx = { channelId: 1 } as unknown as RequestContext;
const customerService = { findAll: vi.fn(), findOne: vi.fn() };
const listQb = {
    alias: 'customer',
    andWhere: vi.fn(),
    getManyAndCount: vi.fn(),
    getParameters: (): Record<string, unknown> => ({ arg1: '%x%' }),
};
const listQueryBuilder = {
    build: vi.fn(() => listQb),
    filterObjectHasProperty: vi.fn(() => false),
};
const visibleQb = {
    alias: 'c',
    clone: (): unknown => visibleQb,
    orderBy: (): unknown => visibleQb,
    select: (): unknown => visibleQb,
    getQuery: (): string => 'SELECT "c"."id"::text FROM counterparty c WHERE c.branchId = :b',
    getParameters: (): Record<string, unknown> => ({ b: 'branch-a' }),
};
const counterpartyService = { visibleFilteredQb: vi.fn(), findOneVisible: vi.fn() };
const accessScope = { resolveCounterpartyScope: vi.fn() };
const resolver = new ScopedCustomerResolver(
    customerService as unknown as CustomerService,
    listQueryBuilder as unknown as ListQueryBuilder,
    counterpartyService as unknown as CounterpartyService,
    accessScope as unknown as AccessScopeService,
);

function scope(kind: 'own' | 'department' | 'all'): void {
    accessScope.resolveCounterpartyScope.mockResolvedValue({ kind });
}

beforeEach(() => {
    vi.clearAllMocks();
    listQb.andWhere.mockReturnValue(listQb);
    listQb.getManyAndCount.mockResolvedValue([[{ id: '4' }], 1]);
    counterpartyService.visibleFilteredQb.mockResolvedValue(visibleQb);
});

describe('ScopedCustomerResolver.customers', () => {
    it('passes the options through to core for scope all', async () => {
        scope('all');
        await resolver.customers(ctx, { options: { take: 3 } }, []);
        expect(customerService.findAll).toHaveBeenCalledWith(ctx, { take: 3 }, []);
        expect(listQueryBuilder.build).not.toHaveBeenCalled();
    });

    it('keeps the caller options and ANDs the visible counterparties as a subquery', async () => {
        scope('department');
        const options = { take: 5, filterOperator: 'OR', filter: { lastName: { eq: 'x' } } };
        expect(await resolver.customers(ctx, { options } as never, [])).toEqual({
            items: [{ id: '4' }],
            totalItems: 1,
        });
        expect(listQueryBuilder.build).toHaveBeenCalledWith(
            expect.anything(),
            options,
            expect.objectContaining({ channelId: 1, ctx }),
        );
        expect(listQb.andWhere).toHaveBeenCalledWith(
            `"customer"."customFieldsCounterpartyid"::text IN (${visibleQb.getQuery()})`,
            { b: 'branch-a' },
        );
    });
});

describe('ScopedCustomerResolver.customer', () => {
    const linked = { id: '4', customFields: { counterpartyId: '9' } };

    it('returns the customer of a visible counterparty with its relations', async () => {
        scope('department');
        customerService.findOne
            .mockResolvedValueOnce(linked)
            .mockResolvedValueOnce({ ...linked, addresses: [] });
        counterpartyService.findOneVisible.mockResolvedValue({ id: '9' });
        expect(await resolver.customer(ctx, { id: '4' }, ['addresses'])).toEqual({
            ...linked,
            addresses: [],
        });
        expect(customerService.findOne).toHaveBeenNthCalledWith(1, ctx, '4');
    });

    it('answers a hidden counterparty like a missing id, without loading relations', async () => {
        scope('department');
        customerService.findOne.mockResolvedValue(linked);
        counterpartyService.findOneVisible.mockResolvedValue(null);
        expect(await resolver.customer(ctx, { id: '4' }, ['addresses'])).toBeUndefined();
        expect(customerService.findOne).toHaveBeenCalledTimes(1);
        expect(customerService.findOne).toHaveBeenCalledWith(ctx, '4');
    });

    it('hides a customer without a counterparty from a scoped caller only', async () => {
        const unlinked = { id: '5', customFields: { counterpartyId: null } };
        customerService.findOne.mockResolvedValue(unlinked);
        scope('own');
        expect(await resolver.customer(ctx, { id: '5' }, [])).toBeUndefined();
        scope('all');
        expect(await resolver.customer(ctx, { id: '5' }, [])).toBe(unlinked);
    });
});
