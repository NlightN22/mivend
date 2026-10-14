import { create, toBinary } from '@bufbuild/protobuf';
import {
    ErpOrderEventSchema,
    OrderCancelResultSchema,
    OrderChangedSchema,
    OrderRegistrationResultSchema,
} from '@nlightn22/event-contracts';
import type { KafkaMessage } from 'kafkajs';
import { describe, expect, it } from 'vitest';

import { classifyOrderEventMessage } from '../../order-events-message';

function message(value: Uint8Array | null, type?: string, key = 'order-uuid-1'): KafkaMessage {
    return {
        key: Buffer.from(key),
        value: value ? Buffer.from(value) : null,
        offset: '7',
        timestamp: '0',
        attributes: 0,
        headers: type === undefined ? {} : { type: Buffer.from(type) },
    } as KafkaMessage;
}

const base = { entityId: 'erp-order-1', eventId: 'event-1', version: '3' };

const registration = toBinary(
    ErpOrderEventSchema,
    create(ErpOrderEventSchema, {
        event: {
            case: 'registrationResult',
            value: create(OrderRegistrationResultSchema, { ...base, orderUuid: 'order-uuid-1' }),
        },
    }),
);
const changed = toBinary(
    ErpOrderEventSchema,
    create(ErpOrderEventSchema, {
        event: { case: 'changed', value: create(OrderChangedSchema, base) },
    }),
);
const cancel = toBinary(
    ErpOrderEventSchema,
    create(ErpOrderEventSchema, {
        event: { case: 'cancelResult', value: create(OrderCancelResultSchema, base) },
    }),
);

describe('classifyOrderEventMessage', () => {
    it.each([
        ['registration-result', registration, 'order-registration-result'],
        ['changed', changed, 'order-changed'],
        ['cancel-result', cancel, 'order-cancel-result'],
    ])('routes type %s to the %s inbox stream', (type, value, stream) => {
        const result = classifyOrderEventMessage(message(value, type), 0);
        expect(result).toMatchObject({
            kind: 'enqueue',
            input: { stream, entityId: 'erp-order-1', sourceEventId: 'event-1', version: '3' },
        });
    });

    it('skips an unknown type without decoding the payload', () => {
        const result = classifyOrderEventMessage(message(Uint8Array.of(1, 2, 3), 'brand-new'), 0);
        expect(result).toEqual({ kind: 'skipped', type: 'brand-new' });
    });

    it('skips change-result, which has no consumer yet', () => {
        const result = classifyOrderEventMessage(message(changed, 'change-result'), 0);
        expect(result).toEqual({ kind: 'skipped', type: 'change-result' });
    });

    it('rejects a header type that disagrees with the payload case', () => {
        const result = classifyOrderEventMessage(message(changed, 'cancel-result'), 0);
        expect(result).toMatchObject({ kind: 'rejected' });
    });

    it('dead-letters an undecodable payload of a known type', () => {
        const result = classifyOrderEventMessage(
            message(Uint8Array.of(255, 255, 255), 'changed'),
            0,
        );
        expect(result).toMatchObject({ kind: 'rejected', rejected: { undecodable: true } });
    });

    it('dead-letters a message without a value', () => {
        const result = classifyOrderEventMessage(message(null, 'changed'), 0);
        expect(result).toMatchObject({ kind: 'rejected' });
    });

    it('routes by the payload case when the header is missing', () => {
        const result = classifyOrderEventMessage(message(cancel), 0);
        expect(result).toMatchObject({ kind: 'enqueue', input: { stream: 'order-cancel-result' } });
    });
});
