import { create, toBinary } from '@bufbuild/protobuf';
import type { MessageInitShape } from '@bufbuild/protobuf';
import { OrderChangedSchema } from '@nlightn22/event-contracts';
import type { RequestContext } from '@vendure/core';
import type { KafkaMessage } from 'kafkajs';
import { describe, expect, it, vi } from 'vitest';

import { OrderChangedStreamHandler } from '../../../handlers/order-changed.handler';
import { classifyInboundMessage } from '../../../kafka-inbound-message';

// Synthetic OrderChanged messages through the real decode + handler, never a real broker.
async function derivedStatusFor(
    fields: MessageInitShape<typeof OrderChangedSchema>,
): Promise<unknown> {
    const message = create(OrderChangedSchema, {
        eventId: '11111111-1111-4111-8111-111111111111',
        entityId: 'erp-order-1',
        version: '1',
        orderUuid: '22222222-2222-4222-8222-222222222222',
        ...fields,
    });
    const classified = classifyInboundMessage(
        'order-changed',
        OrderChangedSchema,
        {
            value: Buffer.from(toBinary(OrderChangedSchema, message)),
            offset: '1',
        } as unknown as KafkaMessage,
        0,
    );
    if (classified.kind !== 'enqueue') throw new Error('expected an enqueue');
    const sync = {
        handleOrderChanged: vi.fn(),
        isUnmatchedLegacyOrder: vi.fn().mockResolvedValue(false),
    };
    const handler = new OrderChangedStreamHandler(
        {} as never,
        sync as never,
        { findByEntityId: vi.fn() } as never,
    );
    await handler.apply({} as RequestContext, 'erp-order-1', classified.input.payload);
    return sync.handleOrderChanged.mock.calls[0][1].derivedStatus;
}

describe('order-changed status facts contract (0.60.0)', () => {
    it.each([
        [{ markedForDeletion: true, delivered: true }, 'CANCELLED'],
        [{ delivered: true, inDelivery: true }, 'DELIVERED'],
        [{ inDelivery: true, hasRealization: true }, 'DELIVERING'],
        [{ hasRealization: true, hasOrder: true }, 'SHIPPING'],
        [{ hasOrder: true, hasRealization: false }, 'PICKING'],
        [{ status: 'Согласован' }, 'APPROVED'],
        [{ status: 'НаСогласовании' }, 'UNDER_APPROVAL'],
    ])('decodes %j into %s', async (fields, expected) => {
        expect(await derivedStatusFor(fields)).toBe(expected);
    });

    it('treats absent facts as not computed and an unknown status as no status', async () => {
        expect(await derivedStatusFor({})).toBeNull();
        expect(await derivedStatusFor({ status: 'SomeFutureValue' })).toBeNull();
    });

    it('treats explicit false facts as computed-false, not as absent', async () => {
        expect(
            await derivedStatusFor({
                markedForDeletion: false,
                delivered: false,
                inDelivery: false,
                hasRealization: false,
                hasOrder: false,
                status: 'Согласован',
            }),
        ).toBe('APPROVED');
    });
});
