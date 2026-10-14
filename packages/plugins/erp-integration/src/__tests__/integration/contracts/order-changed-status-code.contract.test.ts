import { create, toBinary } from '@bufbuild/protobuf';
import type { MessageInitShape } from '@bufbuild/protobuf';
import { OrderChangedSchema } from '@nlightn22/event-contracts';
import type { RequestContext } from '@vendure/core';
import type { KafkaMessage } from 'kafkajs';
import { describe, expect, it, vi } from 'vitest';

import { OrderChangedStreamHandler } from '../../../handlers/order-changed.handler';
import { MissingDependencyError } from '../../../types';
import { classifyInboundMessage } from '../../../kafka-inbound-message';

// Synthetic OrderChanged messages through the real decode + handler, never a real broker.
async function derivedStatusFor(
    fields: MessageInitShape<typeof OrderChangedSchema>,
    referenceKnown = true,
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
    };
    const handler = new OrderChangedStreamHandler(
        {} as never,
        sync as never,
        { findByEntityId: vi.fn() } as never,
        {
            findByErpOrderId: vi.fn().mockResolvedValue({ id: '1', isExternal: false }),
            upsert: vi.fn(),
        } as never,
        { attachOrder: vi.fn() } as never,
        {
            dictionary: async () => ({ get: () => (referenceKnown ? {} : null) }),
        } as never,
    );
    await handler.apply({} as RequestContext, 'erp-order-1', classified.input.payload);
    return sync.handleOrderChanged.mock.calls[0][1].derivedStatus;
}

describe('order-changed status_code contract (0.70.0)', () => {
    it.each([
        'CANCELLED',
        'DELIVERED',
        'DELIVERING',
        'SHIPPING',
        'PICKING',
        'APPROVED',
        'UNDER_APPROVAL',
    ])('decodes status_code %s', async code => {
        expect(await derivedStatusFor({ statusCode: code })).toBe(code);
    });

    it('derives nothing from the facts or the raw status alone', async () => {
        expect(
            await derivedStatusFor({
                markedForDeletion: true,
                delivered: true,
                hasOrder: true,
                status: 'Согласован',
            }),
        ).toBeNull();
        expect(await derivedStatusFor({})).toBeNull();
    });

    it('retries a code the dictionary does not carry yet, whatever the code', async () => {
        for (const code of ['PICKING', 'CANCELLED', 'SOME_FUTURE_CODE']) {
            await expect(derivedStatusFor({ statusCode: code }, false)).rejects.toBeInstanceOf(
                MissingDependencyError,
            );
        }
    });
});
