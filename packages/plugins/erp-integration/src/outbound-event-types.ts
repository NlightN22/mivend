// One entry per outbound type; a new type breaks every Record<OutboundEventType, ...> until filled in.
// `subjectKey`: payload key recovery matches on; `lockKey`: shared live/recovery lock; `versionKey`: older never follows newer.
export const OUTBOUND_EVENT_TYPES = {
    'order.confirmed': {
        subjectKey: 'orderId',
        lockKey: (subject: Record<string, unknown>) => `reserve-order:${String(subject.orderId)}`,
    },
    'order.cancel-requested': { subjectKey: 'orderUuid' },
    'trading-point.changed': {
        subjectKey: 'uuid',
        versionKey: 'version',
        lockKey: (subject: Record<string, unknown>) => `trading-point:${String(subject.uuid)}`,
    },
    'counterparty.changed': {
        subjectKey: 'erpId',
        versionKey: 'version',
        lockKey: (subject: Record<string, unknown>) =>
            `counterparty-outbound:${String(subject.erpId)}`,
    },
} as const;

export type OutboundEventType = keyof typeof OUTBOUND_EVENT_TYPES;

// Carried as protobuf on its own topic, not as a registry-framed JSON command.
export const PROTOBUF_OUTBOUND_EVENT_TYPES = [
    'trading-point.changed',
    'counterparty.changed',
] as const;
export type JsonOutboundEventType = Exclude<
    OutboundEventType,
    (typeof PROTOBUF_OUTBOUND_EVENT_TYPES)[number]
>;

export function versionedSpec(eventType: OutboundEventType): {
    subjectKey: string;
    versionKey: string;
} {
    const spec: { subjectKey: string; versionKey?: string } = OUTBOUND_EVENT_TYPES[eventType];
    if (!spec.versionKey) throw new Error(`Outbound event type "${eventType}" is not versioned`);
    return { subjectKey: spec.subjectKey, versionKey: spec.versionKey };
}

export function lockKeyOf(
    eventType: OutboundEventType,
    subject: Record<string, unknown>,
): string | undefined {
    const spec = OUTBOUND_EVENT_TYPES[eventType] as {
        lockKey?: (subject: Record<string, unknown>) => string;
    };
    return spec.lockKey?.(subject);
}
