import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { DataSource, In } from 'typeorm';

import { IntegrationOutboxEntry } from './entities/integration-outbox-entry.entity';
import { IntegrationOutboxService } from './integration-outbox.service';
import { OrderSubmittedBuilder } from './order-submitted.builder';
import type { OutboundEventType } from './outbound-event-types';
import type { OutboundBuildResult } from './outbound-gateway';

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
        'order.submitted': (ctx, subject) =>
            this.orderSubmitted.build(ctx, String(subject.orderId), String(subject.orderCode)),
    } satisfies Record<OutboundEventType, OutboundRebuilder>;

    constructor(
        private readonly dataSource: DataSource,
        private readonly outbox: IntegrationOutboxService,
        private readonly orderSubmitted: OrderSubmittedBuilder,
    ) {}

    // Conditional UPDATE: only rows still `failed` move, so a double click or a concurrent
    // requeue cannot resurrect a row the processor already republished.
    async requeueFailed(ids: number[]): Promise<number> {
        if (ids.length === 0) return 0;
        const result = await this.dataSource
            .getRepository(IntegrationOutboxEntry)
            .update(
                { id: In(ids), status: 'failed' },
                { status: 'pending', retryCount: 0, firstFailedAt: null, nextRetryAt: null },
            );
        return result.affected ?? 0;
    }

    async rebuildSkipped(ctx: RequestContext, id: number): Promise<RebuildOutcome> {
        return this.dataSource.transaction(async em => {
            const row = await em
                .getRepository(IntegrationOutboxEntry)
                .createQueryBuilder('e')
                .setLock('pessimistic_write')
                .where('e.id = :id AND e.status = :status', { id, status: 'skipped' })
                .getOne();
            if (!row) throw new Error(`Outbox row ${id} is not a skipped row`);

            const alreadySent = await em.query(
                `SELECT 1 FROM integration_outbox
                 WHERE event_type = $1 AND status IN ('pending', 'published') AND payload @> $2::jsonb
                 LIMIT 1`,
                [row.eventType, JSON.stringify(row.payload)],
            );
            if (alreadySent.length > 0) {
                row.status = 'resolved';
                row.lastError = 'already sent by another outbox row';
                await em.save(row);
                return 'already-sent';
            }

            const rebuild = this.rebuilders[row.eventType as OutboundEventType];
            const result = await rebuild(ctx, row.payload);
            if (result.kind === 'send' && result.events.length > 0) {
                for (const event of result.events) {
                    await this.outbox.writeToOutbox(em, {
                        eventId: event.eventId,
                        eventType: row.eventType,
                        payload: event.payload,
                    });
                }
                row.status = 'resolved';
                await em.save(row);
                return 'queued';
            }

            row.lastError = result.kind === 'skip' ? result.reason : 'builder returned no events';
            row.lastErrorAt = new Date();
            await em.save(row);
            return 'still-skipped';
        });
    }
}
