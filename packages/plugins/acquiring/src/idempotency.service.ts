import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import { IdempotencyKey } from './entities/idempotency-key.entity';
import { IdempotencyConflictError } from './types';

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
        const existing = await repo.findOne({ where: { callerId, idempotencyKey } });

        if (existing) {
            if (existing.requestHash !== requestHash) {
                throw new IdempotencyConflictError(
                    'payload-mismatch',
                    `Idempotency key ${callerId}:${idempotencyKey} was already used with a different payload`,
                );
            }
            if (existing.status === 'inProgress') {
                throw new IdempotencyConflictError(
                    'in-progress',
                    `Idempotency key ${callerId}:${idempotencyKey} is already being processed`,
                );
            }
            if (existing.status === 'completed') {
                return JSON.parse(existing.response ?? 'null') as T;
            }
            // status === 'failed': allow a fresh attempt, fall through and overwrite in place.
        }

        const record =
            existing ??
            repo.create({
                callerId,
                idempotencyKey,
                requestHash,
                status: 'inProgress',
                response: null,
            });
        record.requestHash = requestHash;
        record.status = 'inProgress';
        record.response = null;
        await repo.save(record);

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
}
