import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import { CurrencyRecord } from '../entities/currency-record.entity';
import { optionalText } from './erp-mirror-upsert';
import { inboundApplied, inboundNoop } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';

// Applies the `currency` stream; a tombstone keeps the row (documents may still point at it).
@Injectable()
export class CurrencyStreamHandler implements InboundStreamHandler {
    constructor(private readonly connection: TransactionalConnection) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome> {
        const isDeleted = payload.isDeleted === true;
        const repo = this.connection.getRepository(ctx, CurrencyRecord);
        const existing = await repo.findOne({ where: { entityId } });
        const code = optionalText(payload.name);
        if (!code && !existing) {
            return inboundNoop(`currency ${entityId}: no code and no stored row, skipping`);
        }
        const fields = {
            ...(code ? { code } : {}),
            ...(isDeleted
                ? {}
                : {
                      numericCode: optionalText(payload.code),
                      fullName: optionalText(payload.fullName),
                  }),
            isActive: payload.isActive === true && !isDeleted,
            isDeleted,
        };
        await repo.save(
            existing ? { ...existing, ...fields } : repo.create({ entityId, ...fields }),
        );
        return inboundApplied();
    }
}
