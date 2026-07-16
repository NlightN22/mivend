import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import { ProcessedProviderEvent } from './entities/processed-provider-event.entity';

const POSTGRES_UNIQUE_VIOLATION = '23505';

@Injectable()
export class InboxService {
    constructor(private connection: TransactionalConnection) {}

    /**
     * Records a provider event as processed. Returns false (no-op for the caller) if this
     * (provider, providerEventId) pair was already recorded — the UNIQUE index is the hard
     * safety net, not just this application-level check (AGENTS.md sync rule #2).
     */
    async recordIfNew(
        ctx: RequestContext,
        provider: string,
        providerEventId: string,
        payloadHash: string,
    ): Promise<boolean> {
        const repo = this.connection.getRepository(ctx, ProcessedProviderEvent);
        const entity = repo.create({
            provider,
            providerEventId,
            payloadHash,
            processedAt: new Date(),
        });
        try {
            await repo.save(entity);
            return true;
        } catch (err) {
            if (this.isUniqueViolation(err)) {
                return false;
            }
            throw err;
        }
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
