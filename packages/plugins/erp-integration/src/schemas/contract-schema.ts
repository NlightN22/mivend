import * as contracts from '@nlightn22/event-contracts';

import type { JsonOutboundEventType } from '../outbound-event-types';

export type OutboundSchemaSource = 'contract' | 'local';

// Name of each outbound event's JSON schema export in @nlightn22/event-contracts. Once the
// installed package carries it, it wins over the local copy; delete the local file then.
const CONTRACT_EXPORT: Record<JsonOutboundEventType, string> = {
    'order.confirmed': 'ORDER_EVENTS_JSON_SCHEMA',
    'order.cancel-requested': 'ORDER_EVENTS_JSON_SCHEMA',
};

export function resolveOutboundSchema(
    eventType: JsonOutboundEventType,
    local: Record<string, unknown>,
): { schema: Record<string, unknown>; source: OutboundSchemaSource } {
    const fromPackage = (contracts as Record<string, unknown>)[CONTRACT_EXPORT[eventType]];
    return fromPackage && typeof fromPackage === 'object'
        ? { schema: fromPackage as Record<string, unknown>, source: 'contract' }
        : { schema: local, source: 'local' };
}
