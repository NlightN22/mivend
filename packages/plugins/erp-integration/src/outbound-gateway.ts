import { Injectable } from '@nestjs/common';
import { Logger } from '@vendure/core';
import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';

import { IntegrationOutboxService } from './integration-outbox.service';
import type { OutboundEventType } from './outbound-event-types';
import { loggerCtx } from './types';
import { IntegrationOutboxEntry } from './entities/integration-outbox-entry.entity';

export interface OutboundEventDraft {
    eventId?: string;
    payload: Record<string, unknown>;
}

// A builder must return one of these: "nothing to send" is not expressible, so a producer can
// never drop an event without a recorded reason.
export type OutboundBuildResult =
    | { kind: 'send'; events: OutboundEventDraft[] }
    | { kind: 'skip'; reason: string };

export const outboundSend = (events: OutboundEventDraft[]): OutboundBuildResult => ({
    kind: 'send',
    events,
});
export const outboundSkip = (reason: string): OutboundBuildResult => ({ kind: 'skip', reason });

export interface OutboundEnqueueInput {
    eventType: OutboundEventType;
    // Identifies what the event is about (e.g. { orderId, orderCode }); stored on a skipped row so
    // the event can be rebuilt later.
    subject: Record<string, unknown>;
    build: () => Promise<OutboundBuildResult>;
}

export type OutboundEnqueueOutcome = 'queued' | 'skipped';

// The only place outbound events are recorded: every enqueue ends as pending rows, or as one
// skipped row carrying the reason. Producers never call IntegrationOutboxService directly.
@Injectable()
export class OutboundGateway {
    constructor(
        private readonly dataSource: DataSource,
        private readonly outbox: IntegrationOutboxService,
    ) {}

    async enqueue(
        input: OutboundEnqueueInput,
        em?: EntityManager,
    ): Promise<OutboundEnqueueOutcome> {
        let result: OutboundBuildResult;
        try {
            result = await input.build();
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            // Own connection, not the caller's: the caller rolls back on the rethrow below, and the
            // record of the failure must survive that.
            await this.recordSkipped(input, `build failed: ${message}`);
            throw error;
        }

        if (result.kind === 'send' && result.events.length > 0) {
            await this.inTransaction(em, async manager => {
                for (const event of result.events) {
                    await this.outbox.writeToOutbox(manager, {
                        eventId: event.eventId,
                        eventType: input.eventType,
                        payload: event.payload,
                    });
                }
            });
            return 'queued';
        }

        const reason = result.kind === 'skip' ? result.reason : 'builder returned no events';
        await this.recordSkipped(input, reason, em);
        return 'skipped';
    }

    // Guard for a producer's duplicate-publish check (docs/identifiers.md's "Exchange" guard,
    // issue #199): has this orderId already got a non-skipped, non-failed order.submitted entry?
    async hasActiveEntryForOrder(eventType: OutboundEventType, orderId: string): Promise<boolean> {
        const entries = await this.dataSource.getRepository(IntegrationOutboxEntry).find({
            where: { eventType },
        });
        return entries.some(
            entry =>
                (entry.payload as { orderId?: string }).orderId === orderId &&
                (entry.status === 'pending' || entry.status === 'published'),
        );
    }

    private async recordSkipped(
        input: OutboundEnqueueInput,
        reason: string,
        em?: EntityManager,
    ): Promise<void> {
        Logger.warn(`${input.eventType} skipped: ${reason}`, loggerCtx);
        await this.inTransaction(em, manager =>
            this.outbox.writeSkipped(manager, {
                eventType: input.eventType,
                subject: input.subject,
                reason,
            }),
        );
    }

    private async inTransaction(
        em: EntityManager | undefined,
        work: (manager: EntityManager) => Promise<unknown>,
    ): Promise<void> {
        if (em) {
            await work(em);
            return;
        }
        await this.dataSource.transaction(work);
    }
}
