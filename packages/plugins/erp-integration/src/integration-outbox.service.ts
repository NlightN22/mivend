import { Injectable } from '@nestjs/common';
import { TransactionalConnection } from '@vendure/core';
import type { RequestContext } from '@vendure/core';
import { randomUUID } from 'crypto';

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
    constructor(private readonly connection: TransactionalConnection) {}

    // Pass the caller's ctx so the write joins its transaction (outbox invariant).
    // EventBus-triggered calls run after the Order committed, so they are not atomic with it.
    async writeToOutbox(
        ctx: RequestContext,
        input: OutboxWriteInput,
    ): Promise<IntegrationOutboxEntry> {
        const repo = this.connection.getRepository(ctx, IntegrationOutboxEntry);
        return repo.save(
            repo.create({
                eventId: input.eventId ?? randomUUID(),
                eventType: input.eventType,
                payload: input.payload,
                status: 'pending',
            }),
        );
    }

    async writeSkipped(
        ctx: RequestContext,
        input: OutboxSkippedInput,
    ): Promise<IntegrationOutboxEntry> {
        const repo = this.connection.getRepository(ctx, IntegrationOutboxEntry);
        return repo.save(
            repo.create({
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
