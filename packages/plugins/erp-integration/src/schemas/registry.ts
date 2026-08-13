import { ORDER_SUBMITTED_SCHEMA } from './order-submitted.schema';

export interface OutboundEventSchema {
    schema: Record<string, unknown>;
}

// One entry per outbound event type this plugin can publish. A new event type is added here
// alongside its own schema file — never inferred at runtime from the payload shape.
export const OUTBOUND_EVENT_SCHEMAS: Record<string, OutboundEventSchema> = {
    'order.submitted': { schema: ORDER_SUBMITTED_SCHEMA },
};
