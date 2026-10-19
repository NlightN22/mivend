import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { ctxQuery, withAggregateLock } from 'shared';
import { In } from 'typeorm';

import { IntegrationOutboxEntry } from './entities/integration-outbox-entry.entity';
import { IntegrationOutboxService } from './integration-outbox.service';
import { OrderSubmittedBuilder } from './order-submitted.builder';
import { OUTBOUND_EVENT_TYPES } from './outbound-event-types';
import type { OutboundEventType } from './outbound-event-types';
import type { OutboundBuildResult } from './outbound-gateway';
import { buildCancelRequested } from './order-cancel-requested.builder';

// Another recovery got there first; callers that race on purpose (the sweep) treat it as a no-op.
export class NotSkippedError extends Error {}

export type RebuildOutcome = 'queued' | 'still-skipped' | 'already-sent';

type OutboundRebuilder = (
    ctx: RequestContext,
    subject: Record<string, unknown>,
) => Promise<OutboundBuildResult>;

// Recovery for the two non-success outbox states: `failed` (publish gave up) is requeued as-is,
// `skipped` (event could not be built) is rebuilt from the source data once the cause is fixed.
@Injectable()
export class IntegrationOutboxRecoveryService {
    // A new OutboundEventType is a compile error here until it has a rebuilder.
    private readonly rebuilders = {
        'order.confirmed': (ctx, subject) =>
            this.orderSubmitted.build(ctx, String(subject.orderId), String(subject.orderCode)),
        'order.cancel-requested': async (_ctx, subject) =>
            buildCancelRequested(String(subject.orderUuid)),
    } satisfies Record<OutboundEventType, OutboundRebuilder>;

    constructor(
        private readonly connection: TransactionalConnection,
        private readonly outbox: IntegrationOutboxService,
        private readonly orderSubmitted: OrderSubmittedBuilder,
    ) {}

    // Conditional UPDATE: only rows still `failed` move, so a double click or a concurrent
    // requeue cannot resurrect a row the processor already republished.
    async requeueFailed(ctx: RequestContext, ids: number[]): Promise<number> {
        if (ids.length === 0) return 0;
        const result = await this.connection
            .getRepository(ctx, IntegrationOutboxEntry)
            .update(
                { id: In(ids), status: 'failed' },
                { status: 'pending', retryCount: 0, firstFailedAt: null, nextRetryAt: null },
            );
        return result.affected ?? 0;
    }

    async rebuildSkipped(ctx: RequestContext, id: number): Promise<RebuildOutcome> {
        let buildFailure: Error | undefined;
        try {
            return await this.rebuildInTransaction(ctx, id, error => (buildFailure = error));
        } catch (error) {
            if (!buildFailure) throw error;
            await this.connection.getRepository(ctx, IntegrationOutboxEntry).update(
                { id, status: 'skipped' },
                {
                    lastError: `rebuild failed: ${buildFailure.message}`,
                    lastErrorAt: new Date(),
                },
            );
            throw buildFailure;
        }
    }

    private async rebuildInTransaction(
        ctx: RequestContext,
        id: number,
        onBuildFailure: (error: Error) => void,
    ): Promise<RebuildOutcome> {
        return this.connection.withTransaction(ctx, async txCtx => {
            const repo = this.connection.getRepository(txCtx, IntegrationOutboxEntry);
            const row = await repo
                .createQueryBuilder('e')
                .setLock('pessimistic_write')
                .where('e.id = :id AND e.status = :status', { id, status: 'skipped' })
                .getOne();
            if (!row) throw new NotSkippedError(`Outbox row ${id} is not a skipped row`);

            const eventType = row.eventType as OutboundEventType;
            const subjectKey = OUTBOUND_EVENT_TYPES[eventType].subjectKey;
            const isAlreadySent = async (): Promise<boolean> =>
                (
                    await ctxQuery<unknown[]>(
                        this.connection,
                        txCtx,
                        `SELECT 1 FROM integration_outbox
                 WHERE event_type = $1 AND status IN ('pending', 'published')
                   AND payload ->> $2 = $3
                 LIMIT 1`,
                        [row.eventType, subjectKey, String(row.payload[subjectKey])],
                    )
                ).length > 0;
            const markAlreadySent = async (): Promise<'already-sent'> => {
                row.status = 'resolved';
                row.lastError = 'already sent by another outbox row';
                await repo.save(row);
                return 'already-sent';
            };
            if (await isAlreadySent()) return markAlreadySent();

            // A throw rolls this transaction back and is recorded on the row afterwards, not lost.
            let result: OutboundBuildResult;
            try {
                result = await this.rebuilders[eventType](txCtx, row.payload);
            } catch (error) {
                const failure = error instanceof Error ? error : new Error(String(error));
                onBuildFailure(failure);
                throw failure;
            }
            if (result.kind === 'send' && result.events.length > 0) {
                // Lock order: outbox row, then the order lock. The live enqueue holds it across
                // check + insert, so one of the two sees the other's row.
                if (eventType === 'order.confirmed') {
                    await withAggregateLock(
                        this.connection,
                        txCtx,
                        `reserve-order:${String(row.payload.orderId)}`,
                        async () => undefined,
                    );
                    if (await isAlreadySent()) return markAlreadySent();
                }
                for (const event of result.events) {
                    await this.outbox.writeToOutbox(txCtx, {
                        eventId: event.eventId,
                        eventType: row.eventType,
                        payload: event.payload,
                    });
                }
                row.status = 'resolved';
                await repo.save(row);
                return 'queued' as const;
            }

            row.lastError = result.kind === 'skip' ? result.reason : 'builder returned no events';
            row.lastErrorAt = new Date();
            await repo.save(row);
            return 'still-skipped' as const;
        });
    }
}
