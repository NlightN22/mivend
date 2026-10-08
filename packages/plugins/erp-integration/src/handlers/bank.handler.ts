import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import { BankRecord } from '../entities/bank-record.entity';
import { inboundNoop } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';

// Applies the `bank` stream (BankChanged); absent isActive means false, a tombstone keeps the row.
@Injectable()
export class BankStreamHandler implements InboundStreamHandler {
    constructor(private readonly connection: TransactionalConnection) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome | void> {
        const name = String(payload.name ?? '');
        const bik = String(payload.bik ?? '');
        if (!name || !bik) {
            return inboundNoop(`bank ${entityId}: missing name/bik, skipping`);
        }
        const fields = {
            name,
            bik,
            correspondentAccount:
                typeof payload.correspondentAccount === 'string' && payload.correspondentAccount
                    ? payload.correspondentAccount
                    : null,
            isActive: payload.isActive === true && payload.isDeleted !== true,
            isDeleted: payload.isDeleted === true,
        };
        const repo = this.connection.getRepository(ctx, BankRecord);
        const existing = await repo.findOne({ where: { entityId } });
        await repo.save(
            existing ? { ...existing, ...fields } : repo.create({ entityId, ...fields }),
        );
    }
}
