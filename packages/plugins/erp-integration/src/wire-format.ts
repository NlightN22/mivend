// Integration Service needs this header to resolve the OrderSubmitted schema id before parsing.
// Encode side only: inbound streams are plain protobuf with no Confluent header.
const MAGIC_BYTE = 0;

export function encodeConfluentMessage(schemaId: number, payload: unknown): Buffer {
    const header = Buffer.alloc(5);
    header.writeUInt8(MAGIC_BYTE, 0);
    header.writeUInt32BE(schemaId, 1);
    return Buffer.concat([header, Buffer.from(JSON.stringify(payload), 'utf-8')]);
}
