import { ORDER_SUBMITTED_SCHEMA } from './order-submitted.schema';

// Mirrors ORDER_EVENTS_JSON_SCHEMA in @nlightn22/event-contracts 0.59.0 (not yet published); the
// package wins once it is installed. One topic and one union subject for all order events.
export const ORDER_EVENTS_TOPIC = 'mivend.orders.events.v1.order-events';

const CONFIRMED_SCHEMA = {
    ...ORDER_SUBMITTED_SCHEMA,
    title: 'OrderConfirmed',
    required: [...ORDER_SUBMITTED_SCHEMA.required, 'type', 'reserveUntil'],
    properties: {
        ...ORDER_SUBMITTED_SCHEMA.properties,
        type: { const: 'confirmed' },
        reserveUntil: { type: 'string', format: 'date-time' },
    },
} as const;

const CANCEL_REQUESTED_SCHEMA = {
    title: 'OrderCancelRequested',
    type: 'object',
    required: ['eventId', 'orderUuid', 'requestedAt', 'type'],
    properties: {
        eventId: { type: 'string', format: 'uuid' },
        orderUuid: { type: 'string', format: 'uuid' },
        requestedAt: { type: 'string', format: 'date-time' },
        type: { const: 'cancel-requested' },
    },
    additionalProperties: true,
} as const;

export const ORDER_EVENTS_SCHEMA = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'OrderEvent',
    oneOf: [CONFIRMED_SCHEMA, CANCEL_REQUESTED_SCHEMA],
} as const;
