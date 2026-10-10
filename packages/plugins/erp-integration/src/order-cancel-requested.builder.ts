import { randomUUID } from 'crypto';

import { outboundSend } from './outbound-gateway';
import type { OutboundBuildResult } from './outbound-gateway';

// The cancel-requested branch of the order-events union (schemas/order-events.schema.ts).
export function buildCancelRequested(orderUuid: string): OutboundBuildResult {
    const eventId = randomUUID();
    return outboundSend([
        {
            eventId,
            payload: {
                type: 'cancel-requested',
                eventId,
                orderUuid,
                requestedAt: new Date().toISOString(),
            },
        },
    ]);
}
