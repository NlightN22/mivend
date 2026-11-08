import type { RequestContext } from '@vendure/core';
import { describe, expect, it, vi } from 'vitest';

import type { ProformaInvoice } from '../../entities/proforma-invoice.entity';
import { ProformaInvoiceDetailFieldResolver } from '../../proforma-invoice-detail.resolver';
import { ProformaInvoiceDetailService } from '../../proforma-invoice-detail.service';
import { ProformaInvoiceFieldResolver } from '../../proforma-invoice.resolver';

const ctx = {} as RequestContext;

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

describe('ProformaInvoiceDetailService.versions', () => {
    const find = vi.fn();
    const service = new ProformaInvoiceDetailService({
        getRepository: () => ({ find }),
    } as never);

    it('a document without an order is its own only version, with no query', async () => {
        const own = { orderId: null } as ProformaInvoice;
        expect(await service.versions(ctx, own)).toEqual([own]);
        expect(find).not.toHaveBeenCalled();
    });

    it('lists the versions of the same order and organization, newest first', async () => {
        find.mockResolvedValue([]);
        await service.versions(ctx, { orderId: 5, organizationId: 9 } as ProformaInvoice);
        expect(find).toHaveBeenCalledWith({
            where: { orderId: 5, organizationId: 9 },
            order: { version: 'DESC' },
        });
    });
});

describe('ProformaInvoiceDetailFieldResolver.payments', () => {
    it('loads the payments of the parent by its id', async () => {
        const payments = vi.fn().mockResolvedValue([]);
        const resolver = new ProformaInvoiceDetailFieldResolver({ payments } as never);
        await resolver.payments(ctx, { id: '12' } as unknown as ProformaInvoice);
        expect(payments).toHaveBeenCalledWith(ctx, 12);
    });
});
