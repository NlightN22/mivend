import { describe, expect, it } from 'vitest';
import { create, toBinary } from '@bufbuild/protobuf';
import {
    ContactPersonChangedSchema,
    IndividualChangedSchema,
    PersonalContactChangedSchema,
} from '@nlightn22/event-contracts';
import type { KafkaMessage } from 'kafkajs';

import { classifyInboundMessage } from '../../kafka-inbound-message';
import { stripPersonalFields } from '../../personal-data-allowlist';

const PERSONAL = {
    snils: '112-233-445 95',
    driverLicenseSeries: '99 99',
    driverLicenseNumber: '123456',
    birthDate: '1990-01-01',
    gender: 'x',
    barcode: '2000000000001',
    comment: 'private note',
};

function message(): KafkaMessage {
    const event = create(IndividualChangedSchema, {
        eventId: 'e-1',
        entityId: 'i-1',
        version: '1',
        name: 'Person A',
        isActive: true,
        contactInfos: [{ type: 'Телефон', presentation: '+7 912 345-67-89' }],
        ...PERSONAL,
    });
    return {
        value: Buffer.from(toBinary(IndividualChangedSchema, event)),
        offset: '0',
    } as KafkaMessage;
}

describe('personal data never reaches the inbox', () => {
    it('keeps only the allowed fields of a decoded individual', () => {
        const result = classifyInboundMessage('individual', IndividualChangedSchema, message(), 0);
        if (result.kind !== 'enqueue') throw new Error('expected enqueue');
        const stored = JSON.stringify(result.input.payload);
        for (const value of Object.values(PERSONAL)) expect(stored).not.toContain(value);
        expect(result.input.payload).toMatchObject({ name: 'Person A', isActive: true });
        expect(result.input.payload.contactInfos).toHaveLength(1);
    });

    it('does not keep the raw bytes of an undecodable personal-stream message', () => {
        const bad = { value: Buffer.from([0xff, 0xff, 0xff]), offset: '1' } as KafkaMessage;
        const result = classifyInboundMessage('individual', IndividualChangedSchema, bad, 0);
        if (result.kind !== 'rejected') throw new Error('expected rejected');
        expect(result.rejected.payload).toEqual({ rawBase64: '' });
    });

    it('leaves other streams untouched', () => {
        const record = { entityId: 'x', birthDate: 'kept' };
        expect(stripPersonalFields('counterparty', record)).toBe(record);
    });

    it.each([
        ['individual', IndividualChangedSchema],
        ['contact-person', ContactPersonChangedSchema],
        ['personal-contact', PersonalContactChangedSchema],
    ] as const)('%s: undecodable and valueless messages store no raw bytes', (stream, schema) => {
        const bad = { value: Buffer.from([0xff, 0xff, 0xff]), offset: '1' } as KafkaMessage;
        const undecodable = classifyInboundMessage(stream, schema, bad, 0);
        const empty = classifyInboundMessage(stream, schema, { offset: '2' } as KafkaMessage, 0);
        for (const result of [undecodable, empty]) {
            if (result.kind !== 'rejected') throw new Error('expected rejected');
            expect(result.rejected.payload.rawBase64 ?? '').toBe('');
            expect(result.rejected.payload).not.toHaveProperty('birthDate');
        }
    });

    it('a decoded record without an entity id is rejected with only the allowed fields', () => {
        const event = create(IndividualChangedSchema, {
            eventId: 'e-1',
            snils: PERSONAL.snils,
            name: 'A',
        });
        const result = classifyInboundMessage(
            'individual',
            IndividualChangedSchema,
            {
                value: Buffer.from(toBinary(IndividualChangedSchema, event)),
                offset: '3',
            } as KafkaMessage,
            0,
        );
        if (result.kind !== 'rejected') throw new Error('expected rejected');
        expect(JSON.stringify(result.rejected.payload)).not.toContain(PERSONAL.snils);
    });
});
