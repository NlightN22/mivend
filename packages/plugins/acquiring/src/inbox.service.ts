import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import { IncomingPaymentEvent } from './entities/incoming-payment-event.entity';

const POSTGRES_UNIQUE_VIOLATION = '23505';

// After this many failed attempts, an event stops being retried automatically and is
// dead-lettered ('failed', terminal) for manual inspection (AGENTS.md sync rule #4 — "no silent
// drops... eventually routed to a dead-letter queue"). Chosen to tolerate several sweep cycles
// of a transient issue (e.g. a brief DB blip) without either giving up too early or retrying a
// truly broken event forever.
const MAX_ATTEMPTS = 5;

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

    // Claims a batch of pending rows for the periodic sweep (PaymentInboxProcessorService),
    // marking them 'processing' so an overlapping sweep run doesn't pick up the same row twice.
    async claimBatch(ctx: RequestContext, limit = 20): Promise<IncomingPaymentEvent[]> {
        const repo = this.connection.getRepository(ctx, IncomingPaymentEvent);
        const rows = await repo.find({
            where: { status: 'pending' },
            order: { createdAt: 'ASC' },
            take: limit,
        });
        if (rows.length === 0) return rows;
        for (const row of rows) {
            row.status = 'processing';
        }
        await repo.save(rows);
        return rows;
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
