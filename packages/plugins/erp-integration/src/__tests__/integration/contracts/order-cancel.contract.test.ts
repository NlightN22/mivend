import { create, toBinary } from '@bufbuild/protobuf';
import { OrderCancelResultSchema } from '@nlightn22/event-contracts';
import type { KafkaMessage } from 'kafkajs';
import { describe, expect, it } from 'vitest';

import { classifyInboundMessage } from '../../../kafka-inbound-message';
import { ORDER_EVENTS_SCHEMA, ORDER_EVENTS_TOPIC } from '../../../schemas/order-events.schema';
import { OUTBOUND_EVENT_SCHEMAS } from '../../../schemas/registry';
import { buildCancelRequested } from '../../../order-cancel-requested.builder';

// Both directions of the cancel exchange with synthetic messages, never a real broker.
describe('order cancel contract', () => {
    it('cancel-requested is the second branch of the one order-events subject, on the same topic', () => {
        expect(ORDER_EVENTS_TOPIC).toBe('mivend.orders.events.v1.order-events');
        expect(OUTBOUND_EVENT_SCHEMAS['order.cancel-requested'].schema).toBe(
            OUTBOUND_EVENT_SCHEMAS['order.confirmed'].schema,
        );
        const titles = ORDER_EVENTS_SCHEMA.oneOf.map(branch => branch.title);
        expect(titles).toContain('OrderCancelRequested');
    });

    it('builds a payload with exactly the declared required fields and the discriminator', () => {
        const built = buildCancelRequested('22222222-2222-4222-8222-222222222222');
        if (built.kind !== 'send') throw new Error('expected a send');
        const [event] = built.events;

        const branch = ORDER_EVENTS_SCHEMA.oneOf.find(b => b.title === 'OrderCancelRequested');
        expect(Object.keys(event.payload).sort()).toEqual([...(branch?.required ?? [])].sort());
        expect(event.payload).toMatchObject({
            type: 'cancel-requested',
            orderUuid: '22222222-2222-4222-8222-222222222222',
            eventId: event.eventId,
        });
    });

    it('decodes an OrderCancelResult into an inbox row keyed by entityId with the order uuid in the payload', () => {
        const message = create(OrderCancelResultSchema, {
            eventId: '11111111-1111-4111-8111-111111111111',
            entityId: 'cancel-1',
            version: '1',
            orderUuid: '22222222-2222-4222-8222-222222222222',
            status: 'rejected',
            businessRejectionReason: { code: 'IN_PROGRESS', message: 'warehouse order exists' },
        });
        const kafkaMessage = {
            value: Buffer.from(toBinary(OrderCancelResultSchema, message)),
            offset: '1',
        } as unknown as KafkaMessage;

        const classified = classifyInboundMessage(
            'order-cancel-result',
            OrderCancelResultSchema,
            kafkaMessage,
            0,
        );

        expect(classified.kind).toBe('enqueue');
        if (classified.kind !== 'enqueue') return;
        expect(classified.input).toMatchObject({
            stream: 'order-cancel-result',
            entityId: 'cancel-1',
            payload: expect.objectContaining({
                orderUuid: '22222222-2222-4222-8222-222222222222',
                status: 'rejected',
                businessRejectionReason: { code: 'IN_PROGRESS', message: 'warehouse order exists' },
            }),
        });
    });
});
