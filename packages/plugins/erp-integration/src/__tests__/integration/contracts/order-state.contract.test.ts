import { create, toBinary } from '@bufbuild/protobuf';
import {
    ContactInfoSetEventSchema,
    CurrencyChangedSchema,
    OrderStateEventSchema,
} from '@nlightn22/event-contracts';
import type { RequestContext } from '@vendure/core';
import type { KafkaMessage } from 'kafkajs';
import { describe, expect, it, vi } from 'vitest';

import { ContactInfoStreamHandler } from '../../../handlers/contact-info.handler';
import { OrderStateStreamHandler } from '../../../handlers/order-state.handler';
import { passThroughOrderVersions } from '../../order-version-stub';
import { classifyEnvelopeMessage, classifyInboundMessage } from '../../../kafka-inbound-message';
import { ENVELOPE_INNER_SCHEMA, SCHEMA_BY_STREAM } from '../../../kafka-consumer-schemas';

// Synthetic messages through the real decode and handlers, never a real broker.
const kafka = (value: Uint8Array): KafkaMessage =>
    ({ value: Buffer.from(value), offset: '1' }) as unknown as KafkaMessage;
const ids = { eventId: 'e-1', entityId: 'erp-order-1', version: '1' };

describe('order-state contract (0.99.0)', () => {
    it('unwraps the envelope and keeps an absent reserve absent', async () => {
        const bytes = toBinary(
            OrderStateEventSchema,
            create(OrderStateEventSchema, {
                event: {
                    case: 'changed',
                    value: {
                        ...ids,
                        statusCode: 'PICKING',
                        lines: [{ productId: 'p-1' }, { productId: 'p-2', reservedQuantity: 3 }],
                    },
                },
            }),
        );
        const classified = classifyEnvelopeMessage(
            'order-state',
            SCHEMA_BY_STREAM['order-state'],
            ENVELOPE_INNER_SCHEMA['order-state']!,
            kafka(bytes),
            0,
        );
        if (classified.kind !== 'enqueue') throw new Error('expected an enqueue');
        const sync = { handleOrderState: vi.fn() };
        const handler = new OrderStateStreamHandler(
            sync as never,
            {
                findByErpOrderId: vi.fn().mockResolvedValue({ id: '1', isExternal: false }),
            } as never,
            {
                resolve: vi.fn().mockImplementation(async (_c, _s, _e, lines: unknown[]) => ({
                    lines: lines.map((l, i) => ({
                        productVariantId: String(i),
                        ratioToBase: 1,
                        raw: l,
                    })),
                    withoutProductId: 0,
                    unknownProducts: 0,
                })),
            } as never,
            { dictionary: async () => ({ get: () => ({}), has: () => false }) } as never,
            passThroughOrderVersions,
        );
        await handler.apply({} as RequestContext, 'erp-order-1', classified.input.payload);
        const input = sync.handleOrderState.mock.calls[0][1];
        expect(input.derivedStatus).toBe('PICKING');
        expect(input.reservedLines).toEqual([{ productVariantId: '1', reservedQuantity: 3 }]);
        expect(input.linesDiscarded).toBe(true);
    });

    it('skips an envelope without a changed member', () => {
        const bytes = toBinary(OrderStateEventSchema, create(OrderStateEventSchema, {}));
        const classified = classifyEnvelopeMessage(
            'order-state',
            SCHEMA_BY_STREAM['order-state'],
            ENVELOPE_INNER_SCHEMA['order-state']!,
            kafka(bytes),
            0,
        );
        expect(classified.kind).toBe('skipped');
    });
});

describe('contact-info contract (0.99.0)', () => {
    it('decodes rows with the type enumeration and default flag', () => {
        const bytes = toBinary(
            ContactInfoSetEventSchema,
            create(ContactInfoSetEventSchema, {
                event: {
                    case: 'changed',
                    value: {
                        ...ids,
                        entityId: 'owner-1',
                        rows: [
                            {
                                lineNumber: 1,
                                type: { name: 'Телефон', type: 'x' },
                                presentation: '+7 912',
                                isDefault: true,
                            },
                        ],
                    },
                },
            }),
        );
        const classified = classifyEnvelopeMessage(
            'contact-info',
            SCHEMA_BY_STREAM['contact-info'],
            ENVELOPE_INNER_SCHEMA['contact-info']!,
            kafka(bytes),
            0,
        );
        if (classified.kind !== 'enqueue') throw new Error('expected an enqueue');
        expect(classified.input.entityId).toBe('owner-1');
        expect(classified.input.payload.rows).toMatchObject([
            { type: { name: 'Телефон' }, presentation: '+7 912', isDefault: true },
        ]);
        expect(ContactInfoStreamHandler).toBeDefined();
    });
});

describe('currency contract (0.99.0)', () => {
    it('decodes the alphabetic and numeric codes', () => {
        const bytes = toBinary(
            CurrencyChangedSchema,
            create(CurrencyChangedSchema, { ...ids, entityId: 'cur-1', name: 'USD', code: '840' }),
        );
        const classified = classifyInboundMessage(
            'currency',
            CurrencyChangedSchema,
            kafka(bytes),
            0,
        );
        if (classified.kind !== 'enqueue') throw new Error('expected an enqueue');
        expect(classified.input.payload).toMatchObject({ name: 'USD', code: '840' });
    });
});
