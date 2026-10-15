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

// Subscribes via subscribeAndLog so subscription failures are never swallowed silently.
// Each entity supplies only a toOutboxEntry mapping; each write runs in its own transaction.
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
