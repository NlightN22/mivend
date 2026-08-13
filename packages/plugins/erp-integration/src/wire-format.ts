// Confluent wire format: 1 magic byte (always 0) + 4-byte big-endian schema id + payload bytes.
// Used by both JSON Schema and Avro serdes on the Confluent Schema Registry — decoding this
// header is what lets any consumer resolve the schema id before parsing the payload itself.
const MAGIC_BYTE = 0;

export function encodeConfluentMessage(schemaId: number, payload: unknown): Buffer {
    const header = Buffer.alloc(5);
    header.writeUInt8(MAGIC_BYTE, 0);
    header.writeUInt32BE(schemaId, 1);
    return Buffer.concat([header, Buffer.from(JSON.stringify(payload), 'utf-8')]);
}

export interface DecodedConfluentMessage {
    schemaId: number;
    payload: unknown;
}

export function decodeConfluentMessage(message: Buffer): DecodedConfluentMessage {
    if (message.length < 5 || message.readUInt8(0) !== MAGIC_BYTE) {
        throw new Error('Not a valid Confluent wire-format message (missing/wrong magic byte)');
    }
    const schemaId = message.readUInt32BE(1);
    const payload = JSON.parse(message.subarray(5).toString('utf-8'));
    return { schemaId, payload };
}
