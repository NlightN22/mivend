import { fromBinary, toJson } from '@bufbuild/protobuf';
import type { KafkaMessage } from 'kafkajs';

import type { RejectedInboxMessage } from './integration-inbox-rejected';
import type { EnqueueInboxEventInput } from './integration-inbox.service';
import type { InboundStream } from './types';

export type ClassifiedKafkaMessage =
    | { kind: 'enqueue'; input: EnqueueInboxEventInput }
    | { kind: 'rejected'; rejected: RejectedInboxMessage };

// Shared with integration-inbox-issue.resolver.ts/integration-inbox-replay.service.ts — the
// marker for a row that was never decoded, so it has no entity id to replay (#212).
export const DECODE_FAILED_PREFIX = 'decode failed:';

export function isUndecodableLastError(lastError: string | null | undefined): boolean {
    return typeof lastError === 'string' && lastError.startsWith(DECODE_FAILED_PREFIX);
}

// Decides what a consumed message becomes: an inbox row to process, or a rejected one with the
// reason (docs/integration-health.md, "Unprocessable Kafka messages").
export function classifyInboundMessage(
    stream: InboundStream,
    schema: Parameters<typeof fromBinary>[0],
    message: KafkaMessage,
    partition: number,
): ClassifiedKafkaMessage {
    const rejected = (
        reason: string,
        payload: Record<string, unknown>,
        ids: { entityId?: string; sourceEventId?: string } = {},
    ): ClassifiedKafkaMessage => ({
        kind: 'rejected',
        rejected: { stream, partition, offset: message.offset, reason, payload, ...ids },
    });

    if (!message.value) {
        return rejected('message has no value', { key: message.key?.toString() ?? null });
    }
    let record: Record<string, unknown>;
    try {
        record = toJson(schema, fromBinary(schema, new Uint8Array(message.value))) as Record<
            string,
            unknown
        >;
    } catch (err) {
        const reason = `${DECODE_FAILED_PREFIX} ${err instanceof Error ? err.message : String(err)}`;
        return rejected(reason, { rawBase64: message.value.toString('base64') });
    }

    const entityId = String(record.entityId ?? '');
    const sourceEventId = String(record.eventId ?? message.key?.toString() ?? '');
    if (!entityId || !sourceEventId) {
        return rejected('missing entityId/eventId', record, { entityId, sourceEventId });
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
