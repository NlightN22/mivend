import { describe, expect, it } from 'vitest';

import { encodeConfluentMessage } from '../../wire-format';

describe('Confluent wire-format encode (outbound OrderSubmitted producer only)', () => {
    it('encodes the magic byte as 0 and the schema id as 4 big-endian bytes', () => {
        const encoded = encodeConfluentMessage(256, { a: 1 });

        expect(encoded.readUInt8(0)).toBe(0);
        expect(encoded.readUInt32BE(1)).toBe(256);
    });

    it('appends the JSON payload after the 5-byte header', () => {
        const payload = { orderId: 'order-1', organizationId: 'org-1' };
        const encoded = encodeConfluentMessage(42, payload);

        expect(JSON.parse(encoded.subarray(5).toString('utf-8'))).toEqual(payload);
    });
});
