import { describe, expect, it } from 'vitest';

import { ORDER_SUBMITTED_SCHEMA } from '../../../schemas/order-submitted.schema';
import type { OrderSubmittedPayload } from '../../../schemas/order-submitted.schema';
import { encodeConfluentMessage } from '../../../wire-format';

// Contract-compatibility pattern (docs/testing-patterns.md) — this is the boundary MiVend owns
// and is producer-authoritative for (issue #62's Schema Registry decision). No live Registry
// needed: this checks the schema's own required-field/shape stability and the wire-format
// envelope layout against a fixed fixture, same shape as plugin-sync's
// sync-event-envelope.contract.test.ts.
describe('order.submitted contract', () => {
    const FIXTURE: OrderSubmittedPayload = {
        eventId: '11111111-1111-1111-1111-111111111111',
        orderId: 'order-1',
        orderCode: 'ORD-001',
        organizationId: 'org-1',
        contractId: 'contract-1',
        customerId: 'counterparty-1',
        warehouseId: 'warehouse-1',
        lines: [
            { productId: 'product-1', quantity: 2, priceTypeId: 'price-type-wholesale' },
            { productId: 'product-2', quantity: 1, priceTypeId: null },
        ],
        submittedAt: '2026-08-12T00:00:00.000Z',
        totalWithTax: 10000,
        currencyCode: 'RUB',
    };

    it('declares every currently-required field, the consumer needs all of them (#203, #205)', () => {
        expect(ORDER_SUBMITTED_SCHEMA.required).toEqual([
            'eventId',
            'orderId',
            'orderCode',
            'organizationId',
            'contractId',
            'customerId',
            'warehouseId',
            'lines',
            'submittedAt',
        ]);
    });

    it('tolerates unknown extra fields (forward compatibility)', () => {
        expect(ORDER_SUBMITTED_SCHEMA.additionalProperties).toBe(true);
    });

    it('never silently drops a currently-declared property from the schema', () => {
        const declared = Object.keys(ORDER_SUBMITTED_SCHEMA.properties);
        expect(declared).toEqual(
            expect.arrayContaining([
                'eventId',
                'orderId',
                'orderCode',
                'organizationId',
                'contractId',
                'submittedAt',
                'totalWithTax',
                'currencyCode',
                'customerId',
                'warehouseId',
                'lines',
            ]),
        );
    });

    it('declares productId/quantity as the only required OrderLineDto fields', () => {
        expect(ORDER_SUBMITTED_SCHEMA.properties.lines.items.required).toEqual([
            'productId',
            'quantity',
        ]);
    });

    it('encodes a fixed fixture payload with the Confluent wire-format envelope header', () => {
        const encoded = encodeConfluentMessage(7, FIXTURE);

        expect(encoded.readUInt8(0)).toBe(0);
        expect(encoded.readUInt32BE(1)).toBe(7);
        expect(JSON.parse(encoded.subarray(5).toString('utf-8'))).toEqual(FIXTURE);
    });
});
