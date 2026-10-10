import { Injectable } from '@nestjs/common';
import { Logger } from '@vendure/core';
import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';

import { IntegrationOutboxService } from './integration-outbox.service';
import { OUTBOUND_EVENT_TYPES } from './outbound-event-types';
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

    // Guard for the duplicate-publish check (#199): is there a live entry of this type for the
    // subject? Filtered at the SQL level on the type's subject key — this table is never pruned.
    async hasActiveEntry(eventType: OutboundEventType, subjectValue: string): Promise<boolean> {
        const subjectKey = OUTBOUND_EVENT_TYPES[eventType].subjectKey;
        const count = await this.dataSource
            .getRepository(IntegrationOutboxEntry)
            .createQueryBuilder('outbox')
            .where('outbox.event_type = :eventType', { eventType })
            .andWhere('outbox.payload ->> :subjectKey = :subjectValue', {
                subjectKey,
                subjectValue,
            })
            .andWhere('outbox.status IN (:...statuses)', { statuses: ['pending', 'published'] })
            .getCount();
        return count > 0;
    }

    // Statuses of the order's confirmed events that still count: published ones were sent, pending
    // and failed ones never reached the broker.
    async confirmedStatusesForOrder(orderId: string): Promise<string[]> {
        const rows = await this.dataSource.query<Array<{ status: string }>>(
            `SELECT DISTINCT status FROM integration_outbox
             WHERE event_type = 'order.confirmed' AND payload ->> 'orderId' = $1
               AND status IN ('pending', 'failed', 'published')`,
            [orderId],
        );
        return rows.map(row => row.status);
    }

    // Conditional on the row still waiting: it blocks on a publisher's row lock and then matches
    // nothing, so a row can never be both skipped and sent.
    async skipWaitingConfirmed(orderId: string, reason: string): Promise<number> {
        const result = await this.dataSource
            .createQueryBuilder()
            .update(IntegrationOutboxEntry)
            .set({ status: 'skipped', lastError: reason, lastErrorAt: () => 'now()' })
            .where(
                `event_type = 'order.confirmed' AND payload ->> 'orderId' = :orderId
                 AND status IN ('pending', 'failed')`,
                { orderId },
            )
            .execute();
        return result.affected ?? 0;
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
