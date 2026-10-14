import { fromBinary, toJson } from '@bufbuild/protobuf';
import {
    OrderCancelResultSchema,
    OrderChangedSchema,
    ErpOrderEventSchema,
    OrderRegistrationResultSchema,
} from '@nlightn22/event-contracts';
import type { ErpOrderEvent, ErpOrderEventType } from '@nlightn22/event-contracts';
import type { KafkaMessage } from 'kafkajs';

import {
    classifyDecodedRecord,
    noValueReason,
    rejectedMessage,
    rejectedUndecodable,
} from './kafka-inbound-message';
import type { ClassifiedKafkaMessage } from './kafka-inbound-message';
import type { InboundStream } from './types';

export type ClassifiedOrderEvent = ClassifiedKafkaMessage | { kind: 'skipped'; type: string };

type OneofCase = 'registrationResult' | 'cancelResult' | 'changed';

// change-result has no consumer yet (mivend sends no change commands), so it is skipped like an unknown type.
const ROUTES: Partial<Record<ErpOrderEventType, { stream: InboundStream; oneofCase: OneofCase }>> =
    {
        'registration-result': {
            stream: 'order-registration-result',
            oneofCase: 'registrationResult',
        },
        'cancel-result': { stream: 'order-cancel-result', oneofCase: 'cancelResult' },
        changed: { stream: 'order-changed', oneofCase: 'changed' },
    };

export const ORDER_EVENT_STREAMS: readonly InboundStream[] = Object.values(ROUTES).map(
    route => route.stream,
);

function headerType(message: KafkaMessage): string | undefined {
    const raw = message.headers?.type;
    const value = Array.isArray(raw) ? raw[0] : raw;
    return value === undefined ? undefined : value.toString();
}

// One erp.order.events.v1 message carries one OrderEvent; the header `type` picks the inbox
// stream and must agree with the oneof case, anything unlisted is skipped (forward compatible).
export function classifyOrderEventMessage(
    message: KafkaMessage,
    partition: number,
): ClassifiedOrderEvent {
    const type = headerType(message);
    if (type !== undefined && !ROUTES[type as ErpOrderEventType]) return { kind: 'skipped', type };
    const anyStream: InboundStream = ROUTES[type as ErpOrderEventType]?.stream ?? 'order-changed';

    if (!message.value)
        return rejectedMessage(anyStream, message, partition, noValueReason(message));
    let event: ErpOrderEvent;
    try {
        event = fromBinary(ErpOrderEventSchema, new Uint8Array(message.value));
    } catch (err) {
        return rejectedUndecodable(anyStream, message, partition, err);
    }

    const oneofCase = event.event.case;
    if (oneofCase === undefined) return { kind: 'skipped', type: type ?? 'empty' };
    const route = Object.values(ROUTES).find(r => r.oneofCase === oneofCase);
    if (!route) return { kind: 'skipped', type: type ?? String(oneofCase) };
    if (type !== undefined && ROUTES[type as ErpOrderEventType]?.oneofCase !== oneofCase) {
        return rejectedMessage(route.stream, message, partition, {
            reason: `header type "${type}" does not match payload case "${oneofCase}"`,
            payload: { key: message.key?.toString() ?? null },
        });
    }

    const schema =
        oneofCase === 'registrationResult'
            ? OrderRegistrationResultSchema
            : oneofCase === 'cancelResult'
              ? OrderCancelResultSchema
              : OrderChangedSchema;
    const record = toJson(schema, event.event.value as never) as Record<string, unknown>;
    return classifyDecodedRecord(route.stream, record, message, partition);
}
