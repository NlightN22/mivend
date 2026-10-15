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

    // Same key with a different requestHash is a hard conflict, not a replay; never re-executes fn.
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

    // Check-then-save races: two concurrent callers can both see no row and both run fn().
    // INSERT claims the key via the unique index; a 'failed' row is re-claimed by a conditional UPDATE.
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
        // 'inProgress' or 'failed' means another caller owns the row; this caller must not run fn().
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
