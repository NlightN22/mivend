import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { EntityManager } from 'typeorm';

import { IntegrationOutboxEntry } from './entities/integration-outbox-entry.entity';

export interface OutboxSkippedInput {
    eventType: string;
    subject: Record<string, unknown>;
    reason: string;
}

export interface OutboxWriteInput {
    eventId?: string;
    eventType: string;
    payload: Record<string, unknown>;
}

@Injectable()
export class IntegrationOutboxService {
    // Pass the caller's EntityManager so the write joins its transaction (outbox invariant).
    // EventBus-triggered calls run after the Order committed, so they are not atomic with it.
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

    async writeSkipped(
        em: EntityManager,
        input: OutboxSkippedInput,
    ): Promise<IntegrationOutboxEntry> {
        return em.save(
            em.create(IntegrationOutboxEntry, {
                eventId: randomUUID(),
                eventType: input.eventType,
                payload: input.subject,
                status: 'skipped',
                lastError: input.reason,
                lastErrorAt: new Date(),
            }),
        );
    }
}
