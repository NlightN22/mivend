import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import { BankAccountRecord } from '../entities/bank-account-record.entity';
import { inboundNoop } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';

// Applies the `bank-account` stream; bankId/ownerId are stored as soft links, never resolved here.
@Injectable()
export class BankAccountStreamHandler implements InboundStreamHandler {
    constructor(private readonly connection: TransactionalConnection) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome | void> {
        const accountNumber = String(payload.accountNumber ?? '');
        const bankId = String(payload.bankId ?? '');
        const ownerId = String(payload.ownerId ?? '');
        const ownerType = String(payload.ownerType ?? '');
        if (!accountNumber || !bankId || !ownerId || !ownerType) {
            return inboundNoop(`bank-account ${entityId}: missing required field, skipping`);
        }
        const fields = {
            accountNumber,
            bankId,
            ownerId,
            ownerType,
            isActive: payload.isActive === true && payload.isDeleted !== true,
            isDeleted: payload.isDeleted === true,
        };
        const repo = this.connection.getRepository(ctx, BankAccountRecord);
        const existing = await repo.findOne({ where: { entityId } });
        await repo.save(
            existing ? { ...existing, ...fields } : repo.create({ entityId, ...fields }),
        );
    }
}
