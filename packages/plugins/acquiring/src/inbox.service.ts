import { Injectable } from '@nestjs/common';
import { Logger, RequestContext, TransactionalConnection } from '@vendure/core';
import { Brackets } from 'typeorm';

import { IncomingPaymentEvent } from './entities/incoming-payment-event.entity';

const POSTGRES_UNIQUE_VIOLATION = '23505';

// Retry budget spans several sweep cycles so a transient blip (e.g. brief DB outage) is survived,
// but a truly broken event is not retried forever; it ends in terminal 'failed' for manual review.
const MAX_ATTEMPTS = 5;

// Normal processing leaves 'processing' within a second; older rows are from a crashed worker.
// claimBatch selects only 'pending', so without this reclaim such rows would stay stuck forever.
const STUCK_PROCESSING_THRESHOLD_MS = 5 * 60 * 1000;

@Injectable()
export class InboxService {
    constructor(private connection: TransactionalConnection) {}

    // Recorded before any processing so redeliveries are acked without enqueuing a duplicate.
    // Returns the existing row on a repeat; a rejectReason stores it terminal in the same write.
    async enqueue(
        ctx: RequestContext,
        provider: string,
        providerEventId: string,
        payloadHash: string,
        payload: unknown,
        rejectReason?: string,
    ): Promise<IncomingPaymentEvent> {
        const repo = this.connection.getRepository(ctx, IncomingPaymentEvent);
        const existing = await repo.findOne({ where: { provider, providerEventId } });
        if (existing) return existing;

        try {
            return await repo.save(
                repo.create({
                    provider,
                    providerEventId,
                    payloadHash,
                    payload: JSON.stringify(payload),
                    status: rejectReason ? 'failed' : 'pending',
                    attempts: rejectReason ? MAX_ATTEMPTS : 0,
                    lastError: rejectReason ?? null,
                }),
            );
        } catch (err) {
            if (this.isUniqueViolation(err)) {
                // Lost a race with a concurrent enqueue of the same event — the UNIQUE index is
                // the hard safety net (the idempotent-consumer messaging invariant), not just the findOne check above.
                return (await repo.findOne({ where: { provider, providerEventId } }))!;
            }
            throw err;
        }
    }

    // Must be one SELECT ... FOR UPDATE SKIP LOCKED transaction: a find()+save() pair has a TOCTOU race
    // between the scheduled sweep and the admin-triggered run, both could select the same row.
    async claimBatch(ctx: RequestContext, limit = 20): Promise<IncomingPaymentEvent[]> {
        // Use repo.target, not a re-imported entity class, so the transaction resolves through
        // TransactionalConnection (channel scoping, test entity-mapping shims), not a raw connection.
        const outerRepo = this.connection.getRepository(ctx, IncomingPaymentEvent);
        return outerRepo.manager.transaction(async manager => {
            const repo = manager.getRepository(outerRepo.target);
            // Compare against Postgres now(), not an app-side Date: app and DB clocks can differ by hours
            // (observed in the dev container), and updatedAt is also written by the DB clock.
            const rows = await repo
                .createQueryBuilder('event')
                .where(
                    new Brackets(qb => {
                        qb.where('event.status = :pending', { pending: 'pending' }).orWhere(
                            `event.status = :processing AND event.updatedAt < now() - (:staleMs || ' milliseconds')::interval`,
                            { processing: 'processing', staleMs: STUCK_PROCESSING_THRESHOLD_MS },
                        );
                    }),
                )
                .orderBy('event.createdAt', 'ASC')
                .take(limit)
                .setLock('pessimistic_write')
                .setOnLocked('skip_locked')
                .getMany();
            if (rows.length === 0) return rows;
            for (const row of rows) {
                row.status = 'processing';
            }
            await repo.save(rows);
            return rows;
        });
    }

    // Only a row still in 'processing' is settled: a stale worker must not overwrite a newer claim's outcome.
    async markProcessed(ctx: RequestContext, id: number): Promise<void> {
        const result = await this.connection
            .getRepository(ctx, IncomingPaymentEvent)
            .update({ id, status: 'processing' }, { status: 'processed', processedAt: new Date() });
        this.warnIfSettled(result.affected, 'markProcessed', id);
    }

    // Retry backoff is the sweep interval itself; there is no separate delay mechanism.
    async markFailed(ctx: RequestContext, id: number, error: Error): Promise<void> {
        const result = await this.connection
            .getRepository(ctx, IncomingPaymentEvent)
            .createQueryBuilder()
            .update()
            .set({
                attempts: () => 'attempts + 1',
                lastError: error.message,
                status: () =>
                    `CASE WHEN attempts + 1 >= ${MAX_ATTEMPTS} THEN 'failed' ELSE 'pending' END`,
            })
            .where('id = :id AND status = :processing', { id, processing: 'processing' })
            .execute();
        this.warnIfSettled(result.affected, 'markFailed', id);
    }

    // Retrying cannot fix data the producer never sent, so skip straight to the terminal state.
    async rejectAsInvalid(ctx: RequestContext, id: number, reason: string): Promise<void> {
        const result = await this.connection
            .getRepository(ctx, IncomingPaymentEvent)
            .update(
                { id, status: 'processing' },
                { status: 'failed', attempts: MAX_ATTEMPTS, lastError: reason },
            );
        this.warnIfSettled(result.affected, 'rejectAsInvalid', id);
    }

    private warnIfSettled(affected: number | undefined, operation: string, id: number): void {
        if (!affected) {
            Logger.warn(
                `${operation} skipped: inbox event ${id} is no longer processing`,
                'InboxService',
            );
        }
    }

    // Looks up the event backing an already-processed payment, to render a real (not fabricated)
    // processing timeline — see PaymentFieldResolver.processingEvents.
    async findByProviderAndEventId(
        ctx: RequestContext,
        provider: string,
        providerEventId: string,
    ): Promise<IncomingPaymentEvent | null> {
        return this.connection
            .getRepository(ctx, IncomingPaymentEvent)
            .findOne({ where: { provider, providerEventId } });
    }

    private isUniqueViolation(err: unknown): boolean {
        return (
            typeof err === 'object' &&
            err !== null &&
            'code' in err &&
            (err as { code?: string }).code === POSTGRES_UNIQUE_VIOLATION
        );
    }
}
