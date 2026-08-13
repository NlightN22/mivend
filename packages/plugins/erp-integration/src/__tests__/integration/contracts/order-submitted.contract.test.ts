import { describe, expect, it } from 'vitest';

import { ORDER_SUBMITTED_SCHEMA } from '../../../schemas/order-submitted.schema';
import type { OrderSubmittedPayload } from '../../../schemas/order-submitted.schema';
import { encodeConfluentMessage, decodeConfluentMessage } from '../../../wire-format';

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
        submittedAt: '2026-08-12T00:00:00.000Z',
        totalWithTax: 10000,
        currencyCode: 'RUB',
    };

    it('declares every currently-required field', () => {
        expect(ORDER_SUBMITTED_SCHEMA.required).toEqual([
            'eventId',
            'orderId',
            'orderCode',
            'organizationId',
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
                'submittedAt',
                'totalWithTax',
                'currencyCode',
            ]),
        );
    });

    it('round-trips a fixed fixture payload through the Confluent wire-format envelope', () => {
        const encoded = encodeConfluentMessage(7, FIXTURE);
        const decoded = decodeConfluentMessage(encoded);

        expect(decoded.schemaId).toBe(7);
        expect(decoded.payload).toEqual(FIXTURE);
    });
});
