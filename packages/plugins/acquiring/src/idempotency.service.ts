import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import type { Repository } from 'typeorm';

import { IdempotencyKey } from './entities/idempotency-key.entity';
import { IdempotencyConflictError } from './types';

const POSTGRES_UNIQUE_VIOLATION = '23505';

type ClaimResult =
    | { outcome: 'claimed'; record: IdempotencyKey }
    | { outcome: 'conflict' | 'in-progress' | 'completed'; record: IdempotencyKey };

@Injectable()
export class IdempotencyService {
    constructor(private connection: TransactionalConnection) {}

    /**
     * Runs `fn` at most once per (callerId, idempotencyKey, requestHash). A retry with the same
     * key and hash returns the stored result instead of re-executing; a retry with the same key
     * but a different hash is a hard conflict (per docs/payments.md's command idempotency level).
     */
    async withIdempotency<T>(
        ctx: RequestContext,
        callerId: string,
        idempotencyKey: string,
        requestHash: string,
        fn: () => Promise<T>,
    ): Promise<T> {
        const repo = this.connection.getRepository(ctx, IdempotencyKey);
        const claim = await this.claim(repo, callerId, idempotencyKey, requestHash);

        if (claim.outcome === 'conflict') {
            throw new IdempotencyConflictError(
                'payload-mismatch',
                `Idempotency key ${callerId}:${idempotencyKey} was already used with a different payload`,
            );
        }
        if (claim.outcome === 'in-progress') {
            throw new IdempotencyConflictError(
                'in-progress',
                `Idempotency key ${callerId}:${idempotencyKey} is already being processed`,
            );
        }
        if (claim.outcome === 'completed') {
            return JSON.parse(claim.record.response ?? 'null') as T;
        }

        const record = claim.record;
        try {
            const result = await fn();
            record.status = 'completed';
            record.response = JSON.stringify(result);
            await repo.save(record);
            return result;
        } catch (err) {
            record.status = 'failed';
            await repo.save(record);
            throw err;
        }
    }

    // Two callers can race on the exact same (callerId, idempotencyKey) — a retried command that
    // crosses a real network delay/timeout, or an operator manually re-triggering the same
    // action. A plain findOne()-then-save() has a TOCTOU window where both callers see "no
    // existing row" and both proceed to call fn(), defeating the entire point of command
    // idempotency (docs/payments.md level 1 — the guard against e.g. double-charging a payment
    // provider). This claims the row atomically instead, in two steps that only ever let one
    // caller "win": an INSERT that lives or dies on the unique index (mirrors
    // InboxService.enqueue's own already-correct pattern), then — only for a key that already
    // exists — a conditional UPDATE that only flips a row out of 'failed' if it's still 'failed'
    // with a matching hash, so two concurrent retries of the same failed key can't both proceed.
    private async claim(
        repo: Repository<IdempotencyKey>,
        callerId: string,
        idempotencyKey: string,
        requestHash: string,
    ): Promise<ClaimResult> {
        try {
            const record = await repo.save(
                repo.create({
                    callerId,
                    idempotencyKey,
                    requestHash,
                    status: 'inProgress',
                    response: null,
                }),
            );
            return { outcome: 'claimed', record };
        } catch (err) {
            if (!this.isUniqueViolation(err)) throw err;
        }

        const retryClaim = await repo
            .createQueryBuilder()
            .update(repo.target)
            .set({ requestHash, status: 'inProgress', response: null })
            .where(
                'callerId = :callerId AND idempotencyKey = :idempotencyKey AND status = :failed AND requestHash = :requestHash',
                { callerId, idempotencyKey, requestHash, failed: 'failed' },
            )
            .execute();
        if ((retryClaim.affected ?? 0) > 0) {
            return {
                outcome: 'claimed',
                record: await repo.findOneOrFail({ where: { callerId, idempotencyKey } }),
            };
        }

        const existing = await repo.findOneOrFail({ where: { callerId, idempotencyKey } });
        if (existing.requestHash !== requestHash) return { outcome: 'conflict', record: existing };
        if (existing.status === 'completed') return { outcome: 'completed', record: existing };
        // 'inProgress' (a real concurrent call), or 'failed' again (lost the conditional UPDATE
        // race to a concurrent retry that claimed it first) — either way, this caller does not
        // own the row right now.
        return { outcome: 'in-progress', record: existing };
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
