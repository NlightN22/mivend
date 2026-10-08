// One entry per outbound event type. Adding a type here makes every Record<OutboundEventType, ...>
// below (rebuilders) a compile error until it is filled in. `subjectKey` is the payload key that
// identifies what the event is about; recovery uses it to see whether an event was already sent.
export const OUTBOUND_EVENT_TYPES = {
    'order.submitted': { subjectKey: 'orderId' },
} as const;

export type OutboundEventType = keyof typeof OUTBOUND_EVENT_TYPES;
