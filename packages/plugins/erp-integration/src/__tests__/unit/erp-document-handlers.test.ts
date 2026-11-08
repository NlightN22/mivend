import type { RequestContext } from '@vendure/core';
import { describe, expect, it, vi } from 'vitest';

import { CustomerClaimStreamHandler } from '../../handlers/customer-claim.handler';
import { OrderChangeResultStreamHandler } from '../../handlers/order-change-result.handler';
import { OrderCorrectionStreamHandler } from '../../handlers/order-correction.handler';
import { SalesCorrectionStreamHandler } from '../../handlers/sales-correction.handler';

const ctx = {} as RequestContext;
const header = { version: '2026-11-08T10:00:00Z', updatedAt: '2026-11-08T10:00:00Z' };

function makeWriter(result = 'applied') {
    return { write: vi.fn().mockResolvedValue(result) };
}

describe('customer-claim handler', () => {
    const body = {
        ...header,
        number: '100',
        date: '2026-11-01T00:00:00Z',
        orderId: 'order-1',
        counterpartyId: 'cp-1',
        totalAmount: 12.35,
        status: { name: 'open', label: 'Open' },
        goods: [
            { lineNumber: 1, productId: 'p1', quantity: 2, price: 1.1, amount: 2.2 },
            { lineNumber: 2, productId: 'p2', quantity: 1, price: 5, amount: 5, cost: 1.5 },
        ],
        services: [{ lineNumber: 1, content: 'delivery', quantity: 1, price: 3, amount: 3 }],
    };

    it('stores header, minor-unit money and both line sets with soft links as plain ids', async () => {
        const writer = makeWriter();
        const outcome = await new CustomerClaimStreamHandler(writer as never).apply(
            ctx,
            'claim-1',
            body,
        );

        expect(outcome.kind).toBe('applied');
        const call = writer.write.mock.calls[0][1];
        expect(call.erpId).toBe('claim-1');
        expect(call.isDeleted).toBe(false);
        expect(call.hasBody).toBe(true);
        expect(call.fields).toMatchObject({
            number: '100',
            orderId: 'order-1',
            counterpartyId: 'cp-1',
            totalAmountMinor: 1235,
            status: { name: 'open', label: 'Open' },
        });
        expect(call.fields.contractId).toBeNull();
        expect(call.fields.exchangeRate).toBeNull();
        expect(call.lines[0].rows).toHaveLength(2);
        expect(call.lines[0].rows[0]).toMatchObject({
            lineNumber: 1,
            priceMinor: 110,
            amountMinor: 220,
        });
        expect(call.lines[0].rows[0].vatAmountMinor).toBeNull();
        expect(call.lines[1].rows[0]).toMatchObject({ content: 'delivery', amountMinor: 300 });
    });

    it('sends empty line sets when the newer version has no lines, so old lines are cleared', async () => {
        const writer = makeWriter();
        await new CustomerClaimStreamHandler(writer as never).apply(ctx, 'claim-1', {
            ...header,
            number: '100',
        });
        const call = writer.write.mock.calls[0][1];
        expect(call.lines.map((l: { rows: unknown[] }) => l.rows.length)).toEqual([0, 0]);
    });

    it('treats is_deleted without a number as a tombstone that keeps stored data', async () => {
        const writer = makeWriter();
        await new CustomerClaimStreamHandler(writer as never).apply(ctx, 'claim-1', {
            ...header,
            isDeleted: true,
        });
        const call = writer.write.mock.calls[0][1];
        expect(call).toMatchObject({ isDeleted: true, hasBody: false });
    });

    it('is a noop without a version and maps stale and unknown-deleted results to noops', async () => {
        const writer = makeWriter();
        const handler = new CustomerClaimStreamHandler(writer as never);
        expect((await handler.apply(ctx, 'c', { number: '1' })).kind).toBe('noop');
        expect(writer.write).not.toHaveBeenCalled();

        writer.write.mockResolvedValueOnce('stale');
        expect((await handler.apply(ctx, 'c', body)).kind).toBe('noop');
        writer.write.mockResolvedValueOnce('unknown-deleted');
        expect((await handler.apply(ctx, 'c', { ...header, isDeleted: true })).kind).toBe('noop');
    });
});

describe('sales-correction handler', () => {
    it('stores before-values, shipped delta and the secondary lists as received', async () => {
        const writer = makeWriter();
        await new SalesCorrectionStreamHandler(writer as never).apply(ctx, 'sc-1', {
            ...header,
            number: '7',
            orderId: 'order-1',
            totalAmount: 10,
            traceability: [{ quantity: 1 }],
            goods: [
                {
                    lineNumber: 3,
                    productId: 'p1',
                    unitCoefficient: 1,
                    quantity: 4,
                    price: 2.5,
                    amount: 10,
                    quantityBeforeCorrection: 5,
                    amountBeforeCorrection: 12.5,
                    shippedDelta: -1,
                },
            ],
        });
        const call = writer.write.mock.calls[0][1];
        expect(call.fields).toMatchObject({ orderId: 'order-1', totalAmountMinor: 1000 });
        expect(call.fields.traceability).toEqual([{ quantity: 1 }]);
        expect(call.fields.setComponents).toEqual([]);
        expect(call.lines[0].rows[0]).toMatchObject({
            lineNumber: 3,
            quantityBeforeCorrection: 5,
            amountBeforeCorrectionMinor: 1250,
            shippedDelta: -1,
            priceBeforeChangeMinor: null,
        });
    });
});

describe('order-correction handler', () => {
    it('stores goods, service and container lines and keeps the order id as a soft link', async () => {
        const writer = makeWriter();
        await new OrderCorrectionStreamHandler(writer as never).apply(ctx, 'oc-1', {
            ...header,
            number: '9',
            orderId: 'order-404',
            goods: [{ lineNumber: 1, productId: 'p1', quantity: 1, price: 1, amount: 1 }],
            services: [{ lineNumber: 1, content: 'x', quantity: 1, price: 1, amount: 1 }],
            returnableContainers: [
                { lineNumber: 1, productId: 'c1', quantity: 2, price: 1, amount: 2 },
            ],
        });
        const call = writer.write.mock.calls[0][1];
        expect(call.fields.orderId).toBe('order-404');
        expect(call.lines.map((l: { rows: unknown[] }) => l.rows.length)).toEqual([1, 1, 1]);
        expect(call.lines[2].rows[0]).toMatchObject({ productId: 'c1', amountMinor: 200 });
    });
});

describe('order-change-result handler', () => {
    it('stores the result with the rejection reason and soft ids', async () => {
        const writer = makeWriter();
        await new OrderChangeResultStreamHandler(writer as never).apply(ctx, 'r-1', {
            ...header,
            requestEntityId: 'req-1',
            orderEntityId: 'order-1',
            status: 'rejected',
            businessRejectionReason: { code: 'X', message: 'no' },
        });
        const call = writer.write.mock.calls[0][1];
        expect(call.fields).toEqual({
            requestId: 'req-1',
            orderId: 'order-1',
            status: 'rejected',
            rejectionCode: 'X',
            rejectionMessage: 'no',
        });
        expect(call.lines).toEqual([]);
    });

    it('stores a result without a rejection reason or order id', async () => {
        const writer = makeWriter();
        await new OrderChangeResultStreamHandler(writer as never).apply(ctx, 'r-2', {
            ...header,
            status: 'applied',
        });
        expect(writer.write.mock.calls[0][1].fields).toMatchObject({
            orderId: null,
            rejectionCode: null,
        });
    });
});
