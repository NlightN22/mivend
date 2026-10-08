import type { OutboundEventType } from '../outbound-event-types';
import { resolveOutboundSchema } from './contract-schema';
import type { OutboundSchemaSource } from './contract-schema';
import { ORDER_SUBMITTED_SCHEMA } from './order-submitted.schema';

export interface OutboundEventSchema {
    schema: Record<string, unknown>;
    source: OutboundSchemaSource;
}

// One entry per outbound event type this plugin can publish. A new event type is added here
// alongside its own schema file — never inferred at runtime from the payload shape.
export const OUTBOUND_EVENT_SCHEMAS: Record<OutboundEventType, OutboundEventSchema> = {
    'order.submitted': resolveOutboundSchema('order.submitted', ORDER_SUBMITTED_SCHEMA),
};
