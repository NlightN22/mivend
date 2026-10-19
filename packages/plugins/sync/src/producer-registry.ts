import type {
    EventBus,
    RequestContext,
    RequestContextService,
    TransactionalConnection,
    VendureEvent,
} from '@vendure/core';
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

export interface OutboxProducerDeps {
    eventBus: EventBus;
    connection: TransactionalConnection;
    requestContextService: RequestContextService;
    syncService: SyncService;
}

// Subscribes via subscribeAndLog so subscription failures are never swallowed silently.
// Each write runs in its own transaction on a fresh ctx, never inside the emitting request's one.
export function registerOutboxProducer<E extends VendureEvent>(
    deps: OutboxProducerDeps,
    EventClass: EventCtor<E>,
    toOutboxEntry: (
        ctx: RequestContext,
        event: E,
    ) => Promise<OutboxEntry | null> | OutboxEntry | null,
): void {
    subscribeAndLog(
        deps.eventBus,
        EventClass,
        async event => {
            const ctx = await deps.requestContextService.create({ apiType: 'admin' });
            const entry = await toOutboxEntry(ctx, event);
            if (!entry) return;
            await deps.connection.withTransaction(ctx, txCtx =>
                deps.syncService.writeToOutbox(
                    txCtx,
                    { eventId: entry.eventId, eventType: entry.eventType, payload: entry.payload },
                    entry.target,
                ),
            );
        },
        'registerOutboxProducer',
    );
}
