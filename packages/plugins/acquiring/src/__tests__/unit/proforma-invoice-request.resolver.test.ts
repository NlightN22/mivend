import { EntityNotFoundError, ForbiddenError, type RequestContext } from '@vendure/core';
import { describe, expect, it, vi } from 'vitest';

import {
    ProformaInvoiceRequestAdminResolver,
    ProformaInvoiceRequestShopResolver,
} from '../../proforma-invoice-request.resolver';

const ctx = { activeUserId: 'u1' } as unknown as RequestContext;

function shop(order: unknown, counterparties: Record<string, { id: string } | undefined>) {
    const issuing = { requestForOrder: vi.fn(async () => []) };
    const resolver = new ProformaInvoiceRequestShopResolver(
        { getRepository: () => ({ findOne: async () => order }) } as never,
        { findOneByUserId: async () => ({ id: 'own' }) } as never,
        { getForCustomer: async (_c: unknown, id: string) => counterparties[id] } as never,
        issuing as never,
    );
    return { resolver, issuing };
}

describe('requestProformaInvoices (shop)', () => {
    it('refuses an order of another counterparty', async () => {
        const { resolver, issuing } = shop(
            { id: 1, customer: { id: 'other' } },
            { own: { id: '1' }, other: { id: '2' } },
        );
        await expect(resolver.requestProformaInvoices(ctx, { orderCode: 'X' })).rejects.toThrow(
            ForbiddenError,
        );
        expect(issuing.requestForOrder).not.toHaveBeenCalled();
    });

    it('refuses an unknown order and a customer without a counterparty', async () => {
        const missing = shop(null, { own: { id: '1' } });
        await expect(
            missing.resolver.requestProformaInvoices(ctx, { orderCode: 'X' }),
        ).rejects.toThrow(ForbiddenError);
        const none = shop({ id: 1, customer: { id: 'other' } }, {});
        await expect(
            none.resolver.requestProformaInvoices(ctx, { orderCode: 'X' }),
        ).rejects.toThrow(ForbiddenError);
    });

    it('allows a colleague order of the same counterparty', async () => {
        const { resolver, issuing } = shop(
            { id: 1, customer: { id: 'colleague' } },
            { own: { id: '1' }, colleague: { id: '1' } },
        );
        await resolver.requestProformaInvoices(ctx, { orderCode: 'X' });
        expect(issuing.requestForOrder).toHaveBeenCalledWith(ctx, 1);
    });
});

describe('requestProformaInvoicesForOrder (admin)', () => {
    function admin(visible: unknown) {
        const issuing = { requestForOrder: vi.fn(async () => []) };
        const qb = { alias: 'o', andWhere: () => qb, getOne: async () => visible };
        const resolver = new ProformaInvoiceRequestAdminResolver(
            { buildVisibleOrdersQuery: async () => qb } as never,
            issuing as never,
        );
        return { resolver, issuing };
    }

    it('reports an order outside the visibility scope as not found', async () => {
        const { resolver, issuing } = admin(null);
        await expect(resolver.requestProformaInvoicesForOrder(ctx, { orderId: 5 })).rejects.toThrow(
            EntityNotFoundError,
        );
        expect(issuing.requestForOrder).not.toHaveBeenCalled();
    });

    it('issues for a visible order', async () => {
        const { resolver, issuing } = admin({ id: 5 });
        await resolver.requestProformaInvoicesForOrder(ctx, { orderId: 5 });
        expect(issuing.requestForOrder).toHaveBeenCalledWith(ctx, 5);
    });
});
