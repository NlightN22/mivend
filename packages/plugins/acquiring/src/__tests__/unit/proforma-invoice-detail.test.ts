import type { RequestContext } from '@vendure/core';
import { describe, expect, it, vi } from 'vitest';

import type { ProformaInvoice } from '../../entities/proforma-invoice.entity';
import { ProformaInvoiceDetailFieldResolver } from '../../proforma-invoice-detail.resolver';
import { PAYMENTS_CAP, ProformaInvoiceDetailService } from '../../proforma-invoice-detail.service';
import { ProformaInvoiceFieldResolver } from '../../proforma-invoice.resolver';

describe('ProformaInvoiceFieldResolver.lines', () => {
    it('exposes the positive discount total of a snapshot line', () => {
        const resolver = new ProformaInvoiceFieldResolver({} as never, {} as never);
        const [line] = resolver.lines({
            lines: [
                {
                    name: 'Item',
                    sku: 'S1',
                    quantity: 2,
                    unitPriceWithTax: 500,
                    linePriceWithTax: 1000,
                    discounts: [
                        { description: 'a', amount: -60 },
                        { description: 'b', amount: -40 },
                    ],
                },
            ],
        } as unknown as ProformaInvoice);
        expect(line.discountAmount).toBe(100);
    });

    it('treats a snapshot without discounts as no discount', () => {
        const resolver = new ProformaInvoiceFieldResolver({} as never, {} as never);
        const [line] = resolver.lines({
            lines: [{ name: 'I', sku: 'S', quantity: 1, unitPriceWithTax: 1, linePriceWithTax: 1 }],
        } as unknown as ProformaInvoice);
        expect(line.discountAmount).toBe(0);
    });
});

function serviceWith(query: ReturnType<typeof vi.fn>, find: ReturnType<typeof vi.fn>) {
    return new ProformaInvoiceDetailService({
        getRepository: (_ctx: unknown, entity: unknown) =>
            entity === 'Channel' ? { query } : { find },
    } as never);
}

describe('ProformaInvoiceDetailService.versions', () => {
    it('a document without an order is its own only version, with no query', async () => {
        const find = vi.fn();
        const own = { orderId: null } as ProformaInvoice;
        expect(await serviceWith(vi.fn(), find).versions({} as RequestContext, own)).toEqual([own]);
        expect(find).not.toHaveBeenCalled();
    });

    it('one query serves every parent of a request and each gets its own order and organization', async () => {
        const rows = [
            { id: 3, orderId: 5, organizationId: 9, version: 2 },
            { id: 2, orderId: 5, organizationId: 9, version: 1 },
            { id: 4, orderId: 5, organizationId: 8, version: 1 },
            { id: 6, orderId: 6, organizationId: 9, version: 1 },
        ];
        const find = vi.fn().mockResolvedValue(rows);
        const service = serviceWith(vi.fn(), find);
        const requestCtx = {} as RequestContext;
        const [a, b] = await Promise.all([
            service.versions(requestCtx, { orderId: 5, organizationId: 9 } as ProformaInvoice),
            service.versions(requestCtx, { orderId: 6, organizationId: 9 } as ProformaInvoice),
        ]);
        expect(find).toHaveBeenCalledTimes(1);
        expect(a.map(v => v.id)).toEqual([3, 2]);
        expect(b.map(v => v.id)).toEqual([6]);
    });
});

describe('ProformaInvoiceDetailService.payments', () => {
    it('ranks per document in one query, capped at 50, and groups them per parent', async () => {
        const query = vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]);
        const find = vi.fn().mockResolvedValue([
            { id: 2, proformaInvoiceId: 8 },
            { id: 1, proformaInvoiceId: 7 },
        ]);
        const service = serviceWith(query, find);
        const requestCtx = {} as RequestContext;
        const [first, second] = await Promise.all([
            service.payments(requestCtx, 7),
            service.payments(requestCtx, 8),
        ]);
        expect(PAYMENTS_CAP).toBe(50);
        expect(query).toHaveBeenCalledTimes(1);
        expect(query.mock.calls[0][1]).toEqual([[7, 8], 50]);
        expect(first.map(p => p.id)).toEqual([1]);
        expect(second.map(p => p.id)).toEqual([2]);
    });
});

describe('ProformaInvoiceDetailFieldResolver.payments', () => {
    const parent = { id: '12' } as unknown as ProformaInvoice;

    it('loads the payments of the parent when the actor has ReadPayment', async () => {
        const payments = vi.fn().mockResolvedValue([]);
        const resolver = new ProformaInvoiceDetailFieldResolver({ payments } as never);
        const allowed = { userHasPermissions: () => true } as unknown as RequestContext;
        await resolver.payments(allowed, parent);
        expect(payments).toHaveBeenCalledWith(allowed, 12);
    });

    it('returns no payments, without loading, when the actor lacks ReadPayment', async () => {
        const payments = vi.fn();
        const resolver = new ProformaInvoiceDetailFieldResolver({ payments } as never);
        const denied = { userHasPermissions: () => false } as unknown as RequestContext;
        expect(await resolver.payments(denied, parent)).toEqual([]);
        expect(payments).not.toHaveBeenCalled();
    });
});
