import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { EntityManager } from 'typeorm';

import { IntegrationOutboxEntry } from './entities/integration-outbox-entry.entity';

export interface OutboxWriteInput {
    eventId?: string;
    eventType: string;
    payload: Record<string, unknown>;
}

@Injectable()
export class IntegrationOutboxService {
    // Caller passes its own EntityManager so this write can participate in an existing
    // transaction when one is available (the outbox-pattern messaging invariant). EventBus-triggered writes
    // (e.g. OrderStateTransitionEvent) fire after the Order itself already committed via Vendure
    // core — same established precedent as plugin-sync's own EventBus listeners, which are not
    // atomic with the Order write either; see outbox-atomicity.int.test.ts's comment there.
    async writeToOutbox(
        em: EntityManager,
        input: OutboxWriteInput,
    ): Promise<IntegrationOutboxEntry> {
        const entry = em.create(IntegrationOutboxEntry, {
            eventId: input.eventId ?? randomUUID(),
            eventType: input.eventType,
            payload: input.payload,
            status: 'pending',
        });
        return em.save(entry);
    }
}
