import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CustomerService, RequestContext } from '@vendure/core';
import type { AccessScopeService } from '@mivend/plugin-access-control';

import type { CounterpartyService } from '../../counterparty.service';
import { ScopedCustomerResolver, scopedCustomerOptions } from '../../scoped-customer.resolver';

const ctx = {} as RequestContext;
const customerService = { findAll: vi.fn(), findOne: vi.fn() };
const counterpartyService = { findVisible: vi.fn(), findOneVisible: vi.fn() };
const accessScope = { resolveCounterpartyScope: vi.fn() };
const resolver = new ScopedCustomerResolver(
    customerService as unknown as CustomerService,
    counterpartyService as unknown as CounterpartyService,
    accessScope as unknown as AccessScopeService,
);

function scope(kind: 'own' | 'department' | 'all'): void {
    accessScope.resolveCounterpartyScope.mockResolvedValue({ kind });
}

beforeEach(() => {
    vi.clearAllMocks();
    customerService.findAll.mockResolvedValue({ items: [], totalItems: 0 });
});

describe('scopedCustomerOptions', () => {
    it('limits an unfiltered list to the visible counterparties', () => {
        expect(scopedCustomerOptions({ take: 5 }, ['1', '2'])).toEqual({
            take: 5,
            filterOperator: undefined,
            filter: { counterpartyId: { in: ['1', '2'] } },
        });
    });

    it('ANDs the caller filter, so a filter on a hidden counterparty finds nothing', () => {
        const options = scopedCustomerOptions(
            { filter: { counterpartyId: { eq: '9' } } } as never,
            ['1'],
        );
        expect(options.filter).toEqual({
            _and: [{ counterpartyId: { eq: '9' } }, { counterpartyId: { in: ['1'] } }],
        });
    });

    it('nests an OR filter instead of letting it widen the scope', () => {
        const options = scopedCustomerOptions(
            {
                filterOperator: 'OR',
                filter: { emailAddress: { contains: 'a' }, lastName: { contains: 'b' } },
            } as never,
            ['1'],
        );
        expect(options.filterOperator).toBeUndefined();
        expect(options.filter).toEqual({
            _and: [
                { _or: [{ emailAddress: { contains: 'a' } }, { lastName: { contains: 'b' } }] },
                { counterpartyId: { in: ['1'] } },
            ],
        });
    });
});

describe('ScopedCustomerResolver.customers', () => {
    it('passes the options through for scope all', async () => {
        scope('all');
        await resolver.customers(ctx, { options: { take: 3 } }, []);
        expect(customerService.findAll).toHaveBeenCalledWith(ctx, { take: 3 }, []);
        expect(counterpartyService.findVisible).not.toHaveBeenCalled();
    });

    it('scopes a branch caller to the visible counterparties', async () => {
        scope('department');
        counterpartyService.findVisible.mockResolvedValue([{ id: 7 }]);
        await resolver.customers(ctx, {}, []);
        expect(customerService.findAll).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ filter: { counterpartyId: { in: ['7'] } } }),
            [],
        );
    });

    it('returns an empty page when nothing is visible', async () => {
        scope('own');
        counterpartyService.findVisible.mockResolvedValue([]);
        expect(await resolver.customers(ctx, {}, [])).toEqual({ items: [], totalItems: 0 });
        expect(customerService.findAll).not.toHaveBeenCalled();
    });
});

describe('ScopedCustomerResolver.customer', () => {
    const linked = { id: '4', customFields: { counterpartyId: '9' } };

    it('returns the customer of a visible counterparty', async () => {
        scope('department');
        customerService.findOne.mockResolvedValue(linked);
        counterpartyService.findOneVisible.mockResolvedValue({ id: '9' });
        expect(await resolver.customer(ctx, { id: '4' }, [])).toBe(linked);
        expect(counterpartyService.findOneVisible).toHaveBeenCalledWith(ctx, '9');
    });

    it('answers a hidden counterparty like a missing id', async () => {
        scope('department');
        customerService.findOne.mockResolvedValue(linked);
        counterpartyService.findOneVisible.mockResolvedValue(null);
        expect(await resolver.customer(ctx, { id: '4' }, [])).toBeUndefined();
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
