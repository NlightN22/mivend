import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { Brackets } from 'typeorm';

import { IncomingPaymentEvent } from './entities/incoming-payment-event.entity';

const POSTGRES_UNIQUE_VIOLATION = '23505';

// After this many failed attempts, an event stops being retried automatically and is
// dead-lettered ('failed', terminal) for manual inspection (AGENTS.md sync rule #4 — "no silent
// drops... eventually routed to a dead-letter queue"). Chosen to tolerate several sweep cycles
// of a transient issue (e.g. a brief DB blip) without either giving up too early or retrying a
// truly broken event forever.
const MAX_ATTEMPTS = 5;

// A row stuck in 'processing' this long was almost certainly abandoned by a worker that crashed
// or was killed mid-processPendingEvents (it advances to 'processed'/'pending'/'failed' well
// under a second in the normal case) — reclaim it on the next sweep instead of leaving it stuck
// forever, since claimBatch only ever selected 'pending' rows otherwise.
const STUCK_PROCESSING_THRESHOLD_MS = 5 * 60 * 1000;

@Injectable()
export class InboxService {
    constructor(private connection: TransactionalConnection) {}

    // Level 2 idempotency (docs/payments.md): durably records that this (provider,
    // providerEventId) was received, *before* any processing is attempted — this is what lets a
    // provider's webhook redelivery (or a re-sent ERP exchange record) be acknowledged
    // immediately without re-enqueuing a duplicate. Returns the existing row if this event was
    // already seen; the caller should treat either outcome as "safe to ack".
    async enqueue(
        ctx: RequestContext,
        provider: string,
        providerEventId: string,
        payloadHash: string,
        payload: unknown,
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
                    status: 'pending',
                    attempts: 0,
                }),
            );
        } catch (err) {
            if (this.isUniqueViolation(err)) {
                // Lost a race with a concurrent enqueue of the same event — the UNIQUE index is
                // the hard safety net (AGENTS.md sync rule #2), not just the findOne check above.
                return (await repo.findOne({ where: { provider, providerEventId } }))!;
            }
            throw err;
        }
    }

    // Claims a batch of pending rows (plus any row stuck in 'processing' past
    // STUCK_PROCESSING_THRESHOLD_MS — a crashed worker's abandoned claim) for the periodic sweep
    // (PaymentInboxProcessorService). SELECT ... FOR UPDATE SKIP LOCKED inside a single
    // transaction, not a separate find()+save(), is what actually prevents two concurrent
    // callers (the scheduled BullMQ sweep and the admin-triggered "run sweep now" mutation can
    // run at the same time) from both selecting the same row before either commits its
    // 'processing' status — a plain find-then-save has a real TOCTOU race window between the
    // two calls.
    async claimBatch(ctx: RequestContext, limit = 20): Promise<IncomingPaymentEvent[]> {
        // Transact off the same repo's manager (repo.target, not a re-imported entity class) so
        // this still resolves correctly through TransactionalConnection's own repository
        // resolution (channel/ctx scoping in production, entity-mapping test shims in
        // integration tests) rather than assuming a bare rawConnection.getRepository(Entity)
        // lookup — see AGENTS.md "What not to do" on bypassing the service layer.
        const outerRepo = this.connection.getRepository(ctx, IncomingPaymentEvent);
        return outerRepo.manager.transaction(async manager => {
            const repo = manager.getRepository(outerRepo.target);
            // Compares against the database's own now() rather than an app-side `Date`
            // threshold — a fixed interval computed DB-side is immune to any clock skew between
            // the app process and the Postgres server (real, observed in this test suite: the
            // two clocks differed by hours in the dev container), and updatedAt was written by
            // this same DB clock in the first place.
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

    async markProcessed(ctx: RequestContext, id: number): Promise<void> {
        await this.connection
            .getRepository(ctx, IncomingPaymentEvent)
            .update({ id }, { status: 'processed', processedAt: new Date() });
    }

    // Failure -> back to 'pending' for the next sweep (this IS the retry-with-backoff — the
    // backoff comes from the sweep's own interval, not a separate delay mechanism), or 'failed'
    // (dead-letter) once MAX_ATTEMPTS is exhausted.
    async markFailed(ctx: RequestContext, id: number, error: Error): Promise<void> {
        const repo = this.connection.getRepository(ctx, IncomingPaymentEvent);
        const row = await repo.findOneOrFail({ where: { id } });
        const attempts = row.attempts + 1;
        await repo.update(
            { id },
            {
                attempts,
                lastError: error.message,
                status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
            },
        );
    }

    // For a payload that is structurally invalid (e.g. missing a mandatory external reference) —
    // dead-letters immediately instead of retrying, since retrying won't fix data the producer
    // never sent (AGENTS.md sync rule #4: still durably recorded via enqueue() first, never
    // silently dropped, just skipped straight to the terminal state instead of wasting sweep
    // cycles on a message that can never become valid on its own).
    async rejectAsInvalid(ctx: RequestContext, id: number, reason: string): Promise<void> {
        await this.connection
            .getRepository(ctx, IncomingPaymentEvent)
            .update({ id }, { status: 'failed', attempts: MAX_ATTEMPTS, lastError: reason });
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
