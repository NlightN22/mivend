import { Injectable, Logger } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import { LegalFormRecord } from '../entities/legal-form-record.entity';
import { loggerCtx } from '../types';
import type { InboundStreamHandler } from './inbound-stream-handler';

// Applies the `legal-form` stream (LegalFormChanged); a tombstone keeps the row with isDeleted set.
@Injectable()
export class LegalFormStreamHandler implements InboundStreamHandler {
    constructor(private readonly connection: TransactionalConnection) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<void> {
        const name = String(payload.name ?? '');
        const code = String(payload.code ?? '');
        if (!name || !code) {
            Logger.warn(`legal-form ${entityId}: missing name/code, skipping`, loggerCtx);
            return;
        }
        const fields = {
            name,
            code,
            fullName:
                typeof payload.fullName === 'string' && payload.fullName !== ''
                    ? payload.fullName
                    : null,
            isActive: payload.isActive === true && payload.isDeleted !== true,
            isDeleted: payload.isDeleted === true,
        };
        const repo = this.connection.getRepository(ctx, LegalFormRecord);
        const existing = await repo.findOne({ where: { entityId } });
        await repo.save(
            existing ? { ...existing, ...fields } : repo.create({ entityId, ...fields }),
        );
    }
}
