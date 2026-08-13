import { describe, expect, it } from 'vitest';

import { decodeConfluentMessage, encodeConfluentMessage } from '../../wire-format';

describe('Confluent wire-format encode/decode', () => {
    it('round-trips a schema id and JSON payload', () => {
        const payload = { orderId: 'order-1', organizationId: 'org-1' };
        const encoded = encodeConfluentMessage(42, payload);

        const decoded = decodeConfluentMessage(encoded);

        expect(decoded.schemaId).toBe(42);
        expect(decoded.payload).toEqual(payload);
    });

    it('encodes the magic byte as 0 and the schema id as 4 big-endian bytes', () => {
        const encoded = encodeConfluentMessage(256, { a: 1 });

        expect(encoded.readUInt8(0)).toBe(0);
        expect(encoded.readUInt32BE(1)).toBe(256);
    });

    it('rejects a buffer with a wrong magic byte', () => {
        const bogus = Buffer.concat([Buffer.from([1, 0, 0, 0, 1]), Buffer.from('{}')]);

        expect(() => decodeConfluentMessage(bogus)).toThrow(/magic byte/);
    });

    it('rejects a buffer shorter than the 5-byte header', () => {
        expect(() => decodeConfluentMessage(Buffer.from([0, 0]))).toThrow();
    });
});
