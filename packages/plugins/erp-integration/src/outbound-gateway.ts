import { Injectable } from '@nestjs/common';
import { Logger, TransactionalConnection } from '@vendure/core';
import type { RequestContext } from '@vendure/core';
import { ctxQuery, withAggregateLock } from 'shared';

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
    // Aggregate lock held across build + write, so a concurrent enqueue sees this one's row.
    lockKey?: string;
    build: (ctx: RequestContext) => Promise<OutboundBuildResult>;
}

export type OutboundEnqueueOutcome = 'queued' | 'skipped';

// The only place outbound events are recorded: every enqueue ends as pending rows, or as one
// skipped row carrying the reason. Producers never call IntegrationOutboxService directly.
@Injectable()
export class OutboundGateway {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly outbox: IntegrationOutboxService,
    ) {}

    // Writes join the ctx transaction, so they commit or roll back with the caller's change.
    async enqueue(
        ctx: RequestContext,
        input: OutboundEnqueueInput,
    ): Promise<OutboundEnqueueOutcome> {
        let buildError: unknown;
        try {
            return await this.inTransaction(ctx, input.lockKey, async txCtx => {
                let result: OutboundBuildResult;
                try {
                    result = await input.build(txCtx);
                } catch (error) {
                    buildError = error;
                    throw error;
                }
                if (result.kind === 'send' && result.events.length > 0) {
                    for (const event of result.events) {
                        await this.outbox.writeToOutbox(txCtx, {
                            eventId: event.eventId,
                            eventType: input.eventType,
                            payload: event.payload,
                        });
                    }
                    return 'queued';
                }
                const reason =
                    result.kind === 'skip' ? result.reason : 'builder returned no events';
                await this.recordSkipped(txCtx, input, reason);
                return 'skipped';
            });
        } catch (error) {
            if (buildError === undefined) throw error;
            const message = buildError instanceof Error ? buildError.message : String(buildError);
            // After the rolled-back transaction, so the failure record survives it.
            await this.connection.withTransaction(ctx, txCtx =>
                this.recordSkipped(txCtx, input, `build failed: ${message}`),
            );
            throw error;
        }
    }

    // Guard for the duplicate-publish check (#199): is there a live entry of this type for the
    // subject? Filtered at the SQL level on the type's subject key — this table is never pruned.
    async hasActiveEntry(
        ctx: RequestContext,
        eventType: OutboundEventType,
        subjectValue: string,
    ): Promise<boolean> {
        const subjectKey = OUTBOUND_EVENT_TYPES[eventType].subjectKey;
        const count = await this.connection
            .getRepository(ctx, IntegrationOutboxEntry)
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
    async confirmedStatusesForOrder(ctx: RequestContext, orderId: string): Promise<string[]> {
        const rows = await ctxQuery<Array<{ status: string }>>(
            this.connection,
            ctx,
            `SELECT DISTINCT status FROM integration_outbox
             WHERE event_type = 'order.confirmed' AND payload ->> 'orderId' = $1
               AND status IN ('pending', 'failed', 'published')`,
            [orderId],
        );
        return rows.map(row => row.status);
    }

    // Conditional on the row still waiting: it blocks on a publisher's row lock and then matches
    // nothing, so a row can never be both skipped and sent.
    async skipWaitingConfirmed(
        ctx: RequestContext,
        orderId: string,
        reason: string,
    ): Promise<number> {
        const result = await this.connection
            .getRepository(ctx, IntegrationOutboxEntry)
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
        ctx: RequestContext,
        input: OutboundEnqueueInput,
        reason: string,
    ): Promise<void> {
        Logger.warn(`${input.eventType} skipped: ${reason}`, loggerCtx);
        await this.outbox.writeSkipped(ctx, {
            eventType: input.eventType,
            subject: input.subject,
            reason,
        });
    }

    private inTransaction<T>(
        ctx: RequestContext,
        lockKey: string | undefined,
        work: (txCtx: RequestContext) => Promise<T>,
    ): Promise<T> {
        return lockKey
            ? withAggregateLock(this.connection, ctx, lockKey, work)
            : this.connection.withTransaction(ctx, work);
    }
}
