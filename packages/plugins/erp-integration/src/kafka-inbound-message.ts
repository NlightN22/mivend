import { fromBinary, toJson } from '@bufbuild/protobuf';
import type { KafkaMessage } from 'kafkajs';

import type { RejectedInboxMessage } from './integration-inbox-rejected';
import type { EnqueueInboxEventInput } from './integration-inbox.service';
import type { InboundStream } from './types';

export type ClassifiedKafkaMessage =
    | { kind: 'enqueue'; input: EnqueueInboxEventInput }
    | { kind: 'rejected'; rejected: RejectedInboxMessage };

// Human-readable marker for a decode failure (#212); the durable replay/dismiss signal is
// IntegrationInboxEvent.undecodable (#213) — lastError can be overwritten by a later replay attempt.
export const DECODE_FAILED_PREFIX = 'decode failed:';

// Decides what a consumed message becomes: an inbox row to process, or a rejected one with the
// reason (docs/integration-health.md, "Unprocessable Kafka messages").
export function classifyInboundMessage(
    stream: InboundStream,
    schema: Parameters<typeof fromBinary>[0],
    message: KafkaMessage,
    partition: number,
): ClassifiedKafkaMessage {
    if (!message.value) return rejectedMessage(stream, message, partition, noValueReason(message));
    let record: Record<string, unknown>;
    try {
        record = toJson(schema, fromBinary(schema, new Uint8Array(message.value))) as Record<
            string,
            unknown
        >;
    } catch (err) {
        return rejectedUndecodable(stream, message, partition, err);
    }
    return classifyDecodedRecord(stream, record, message, partition);
}

export function noValueReason(message: KafkaMessage): {
    reason: string;
    payload: Record<string, unknown>;
} {
    return {
        reason: 'message has no value',
        payload: { key: message.key?.toString() ?? null },
    };
}

export function rejectedMessage(
    stream: InboundStream,
    message: KafkaMessage,
    partition: number,
    { reason, payload }: { reason: string; payload: Record<string, unknown> },
    ids: { entityId?: string; sourceEventId?: string; undecodable?: boolean } = {},
): ClassifiedKafkaMessage {
    return {
        kind: 'rejected',
        rejected: { stream, partition, offset: message.offset, reason, payload, ...ids },
    };
}

export function rejectedUndecodable(
    stream: InboundStream,
    message: KafkaMessage,
    partition: number,
    err: unknown,
): ClassifiedKafkaMessage {
    const reason = `${DECODE_FAILED_PREFIX} ${err instanceof Error ? err.message : String(err)}`;
    return rejectedMessage(
        stream,
        message,
        partition,
        { reason, payload: { rawBase64: message.value?.toString('base64') ?? '' } },
        { undecodable: true },
    );
}

export function classifyDecodedRecord(
    stream: InboundStream,
    record: Record<string, unknown>,
    message: KafkaMessage,
    partition: number,
): ClassifiedKafkaMessage {
    const entityId = String(record.entityId ?? '');
    const sourceEventId = String(record.eventId ?? message.key?.toString() ?? '');
    if (!entityId || !sourceEventId) {
        return rejectedMessage(
            stream,
            message,
            partition,
            { reason: 'missing entityId/eventId', payload: record },
            { entityId, sourceEventId },
        );
    }
    return {
        kind: 'enqueue',
        input: {
            stream,
            entityId,
            version: String(record.version ?? ''),
            sourceEventId,
            payload: record,
        },
    };
}
