// One entry per outbound event type; a new type breaks every Record<OutboundEventType, ...> until
// filled in. `subjectKey` is the payload key recovery uses to detect an already-sent event.
export const OUTBOUND_EVENT_TYPES = {
    'order.confirmed': { subjectKey: 'orderId' },
} as const;

export type OutboundEventType = keyof typeof OUTBOUND_EVENT_TYPES;
