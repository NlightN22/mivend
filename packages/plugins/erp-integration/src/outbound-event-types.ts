// One entry per outbound event type. Adding a type here makes every Record<OutboundEventType, ...>
// below (schemas, rebuilders) a compile error until it is filled in.
export const OUTBOUND_EVENT_TYPES = { 'order.submitted': true } as const;

export type OutboundEventType = keyof typeof OUTBOUND_EVENT_TYPES;
