import type { DataSource } from 'typeorm';
import type { EventBus, VendureEvent } from '@vendure/core';
import { subscribeAndLog } from 'shared';
import type { SyncEvent } from 'shared';

import type { SyncService } from './sync.service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventCtor<E extends VendureEvent> = new (...args: any[]) => E;

export interface OutboxEntry {
    eventId?: string;
    eventType: SyncEvent['eventType'];
    payload: SyncEvent['payload'];
    target: string;
}

// Shared plumbing for every plugin-sync producer: subscribe (via `subscribeAndLog`, so a
// failure here is never silently swallowed — see that helper's doc comment) to a Vendure/plugin
// EventBus event, let the caller decide (via toOutboxEntry) whether it's sync-worthy and what
// it maps to, then write it to the outbox in its own transaction — same shape as
// ReservationConsumer's two handlers, generalized so a new entity's sync rule is just a mapping
// function, not a new provider with its own constructor/subscribe/transaction boilerplate.
export function registerOutboxProducer<E extends VendureEvent>(
    eventBus: EventBus,
    dataSource: DataSource,
    syncService: SyncService,
    EventClass: EventCtor<E>,
    toOutboxEntry: (event: E) => Promise<OutboxEntry | null> | OutboxEntry | null,
): void {
    subscribeAndLog(
        eventBus,
        EventClass,
        async event => {
            const entry = await toOutboxEntry(event);
            if (!entry) return;
            await dataSource.transaction(em =>
                syncService.writeToOutbox(
                    em,
                    { eventId: entry.eventId, eventType: entry.eventType, payload: entry.payload },
                    entry.target,
                ),
            );
        },
        'registerOutboxProducer',
    );
}
