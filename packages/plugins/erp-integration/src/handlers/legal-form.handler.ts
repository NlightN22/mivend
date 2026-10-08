import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import { LegalFormRecord } from '../entities/legal-form-record.entity';
import { inboundApplied, inboundNoop } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';

// Applies the `legal-form` stream (LegalFormChanged); a tombstone keeps the row with isDeleted set.
@Injectable()
export class LegalFormStreamHandler implements InboundStreamHandler {
    constructor(private readonly connection: TransactionalConnection) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome> {
        const name = String(payload.name ?? '');
        const code = String(payload.code ?? '');
        if (!name || !code) {
            return inboundNoop(`legal-form ${entityId}: missing name/code, skipping`);
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
        return inboundApplied();
    }
}
