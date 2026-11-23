import type { RequestContext } from '@vendure/core';
import { describe, expect, it, vi } from 'vitest';

import { SalesDocumentStreamHandler } from '../../handlers/sales-document.handler';

const ctx = {} as RequestContext;
const header = { version: '2026-11-08T10:00:00Z', updatedAt: '2026-11-08T10:00:00Z' };

function make(result = 'applied'): {
    writer: { write: ReturnType<typeof vi.fn> };
    currencies: { codeOf: ReturnType<typeof vi.fn> };
    handler: SalesDocumentStreamHandler;
} {
    const writer = { write: vi.fn().mockResolvedValue(result) };
    const currencies = { codeOf: vi.fn().mockResolvedValue('USD') };
    const handler = new SalesDocumentStreamHandler(writer as never, currencies as never);
    return { writer, currencies, handler };
}

describe('sales document handler', () => {
    const body = {
        ...header,
        number: '77',
        isPosted: true,
        dealId: 'order-1',
        totalAmount: 10.5,
        currencyId: 'cur-1',
        comment: 'note',
        goods: [
            {
                lineNumber: 3,
                productId: 'p1',
                quantity: 2,
                coefficient: 6,
                amount: 4,
                customerOrderId: 'order-1',
                rowKey: 9,
            },
            { productId: 'p2', quantity: 1 },
        ],
        services: [{}],
    };

    it('stores header columns, the rest as attributes and every table part as rows', async () => {
        const { writer, handler } = make();
        const outcome = await handler
            .forStream('goods-and-services-sale')
            .apply(ctx, 'doc-1', body);
        expect(outcome.kind).toBe('applied');
        const call = writer.write.mock.calls[0][1];
        expect(call.erpId).toBe('doc-1');
        expect(call.fields).toMatchObject({
            kind: 'goods-and-services-sale',
            number: '77',
            posted: true,
            deletionMarked: false,
            dealId: 'order-1',
            totalAmountMinor: 1050,
            currency: 'USD',
            truncated: false,
            attributes: { comment: 'note' },
        });
        const rows = call.lines[0].rows;
        expect(rows).toHaveLength(3);
        expect(rows[0]).toMatchObject({
            part: 'goods',
            lineNumber: 3,
            linkedId: 'order-1',
            quantity: 2,
            coefficient: 6,
            amountMinor: 400,
            attributes: { rowKey: 9 },
        });
        expect(rows[1]).toMatchObject({ part: 'goods', lineNumber: 2, linkedId: null });
        expect(rows[2]).toMatchObject({ part: 'services', lineNumber: 1 });
    });

    it('keeps the warehouse order as the basis of a work result', async () => {
        const { writer, handler } = make();
        await handler.forStream('tl-warehouse-work-result').apply(ctx, 'wr-1', {
            ...header,
            number: '5',
            warehouseOrderId: 'wo-1',
            employeeId: 'e1',
        });
        const fields = writer.write.mock.calls[0][1].fields;
        expect(fields.basisDocumentId).toBe('wo-1');
        expect(fields.attributes).toEqual({ employeeId: 'e1' });
    });

    it('treats a body-less deleted event as a tombstone and skips the currency lookup', async () => {
        const { writer, currencies, handler } = make();
        await handler
            .forStream('customer-goods-return')
            .apply(ctx, 'doc-1', { ...header, isDeleted: true });
        const call = writer.write.mock.calls[0][1];
        expect(call.isDeleted).toBe(true);
        expect(call.hasBody).toBe(false);
        expect(currencies.codeOf).not.toHaveBeenCalled();
    });

    it('records truncation and row counts without rows', async () => {
        const { writer, handler } = make();
        await handler.forStream('goods-and-services-sale').apply(ctx, 'doc-1', {
            ...header,
            number: '1',
            truncated: true,
            tableRowCounts: { goods: 90000 },
        });
        const call = writer.write.mock.calls[0][1];
        expect(call.fields).toMatchObject({ truncated: true, rowCounts: { goods: 90000 } });
        expect(call.lines[0].rows).toEqual([]);
    });

    it('reports a stale version and a missing version as no-ops', async () => {
        expect(
            (
                await make('stale')
                    .handler.forStream('debt-correction')
                    .apply(ctx, 'd', { ...header, number: '1' })
            ).kind,
        ).toBe('noop');
        expect(
            (await make().handler.forStream('debt-correction').apply(ctx, 'd', { number: '1' }))
                .kind,
        ).toBe('noop');
    });
});
