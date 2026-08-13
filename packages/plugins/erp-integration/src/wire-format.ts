// Confluent wire format: 1 magic byte (always 0) + 4-byte big-endian schema id + payload bytes.
// Used by both JSON Schema and Avro serdes on the Confluent Schema Registry — encoding this
// header is what lets Integration Service's consumer resolve our OrderSubmitted schema id before
// parsing the payload. This is the encode side ONLY: this plugin's own outbound `OrderSubmitted`
// producer is the sole user of this wire format. The 8 inbound catalog/price/stock streams do NOT
// use it — they are plain protobuf `toBinary()`/`fromBinary()` with no Confluent header at all
// (see kafka-consumer.service.ts's comment and docs/ai/1c-integration-service-decision.md's
// 2026-08-14 retraction) — a decode counterpart was removed for that reason.
const MAGIC_BYTE = 0;

export function encodeConfluentMessage(schemaId: number, payload: unknown): Buffer {
    const header = Buffer.alloc(5);
    header.writeUInt8(MAGIC_BYTE, 0);
    header.writeUInt32BE(schemaId, 1);
    return Buffer.concat([header, Buffer.from(JSON.stringify(payload), 'utf-8')]);
}
