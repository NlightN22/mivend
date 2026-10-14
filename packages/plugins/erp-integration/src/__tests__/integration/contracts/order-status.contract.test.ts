import { create, toBinary } from '@bufbuild/protobuf';
import { OrderStatusChangedSchema } from '@nlightn22/event-contracts';
import type { KafkaMessage } from 'kafkajs';
import { describe, expect, it } from 'vitest';

import { classifyInboundMessage } from '../../../kafka-inbound-message';

// Synthetic OrderStatusChanged bytes through the real decode, never a real broker.
function decode(fields: Parameters<typeof create<typeof OrderStatusChangedSchema>>[1]): unknown {
    const message = create(OrderStatusChangedSchema, {
        eventId: '11111111-1111-4111-8111-111111111111',
        entityId: 'PICKING',
        version: '1',
        code: 'PICKING',
        ...fields,
    });
    const classified = classifyInboundMessage(
        'order-status',
        OrderStatusChangedSchema,
        {
            value: Buffer.from(toBinary(OrderStatusChangedSchema, message)),
            offset: '1',
        } as unknown as KafkaMessage,
        0,
    );
    if (classified.kind !== 'enqueue') throw new Error('expected an enqueue');
    return classified.input.payload;
}

describe('order-status contract (0.69.0)', () => {
    it('decodes every field the reference carries', () => {
        expect(
            decode({
                name: 'Picking',
                rank: 5,
                terminal: true,
                customerVisible: true,
                description: 'Order is being picked',
                isDeleted: false,
            }),
        ).toMatchObject({
            code: 'PICKING',
            name: 'Picking',
            rank: 5,
            terminal: true,
            customerVisible: true,
            description: 'Order is being picked',
            isDeleted: false,
        });
    });

    it('omits plain proto3 scalars at their zero value but keeps is_deleted presence', () => {
        const payload = decode({ name: 'Cancelled', rank: 0 }) as Record<string, unknown>;

        expect(payload).not.toHaveProperty('terminal');
        expect(payload).not.toHaveProperty('customerVisible');
        expect(payload).not.toHaveProperty('isDeleted');
    });
});
