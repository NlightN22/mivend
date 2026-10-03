import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import { GrantedDiscount } from './granted-discount.entity';

export interface GrantedDiscountInput {
    erpId: string;
    sourceDocumentId: string;
    counterpartyErpId: string;
    productErpId: string;
    orderEntityId: string | null;
    discountDocumentId: string | null;
    discountRuleRecipientId: string;
    condition: string | null;
    discountAmount: number;
    sourceVersion: string;
}

@Injectable()
export class GrantedDiscountService {
    constructor(private connection: TransactionalConnection) {}

    // A 1C unposting tombstone — a later higher-version event re-creates the row via upsert.
    async remove(ctx: RequestContext, erpId: string): Promise<void> {
        await this.connection.getRepository(ctx, GrantedDiscount).delete({ erpId });
    }

    // Out-of-order protection is the inbox's own version guard, so this is a plain upsert by erpId.
    async upsert(ctx: RequestContext, input: GrantedDiscountInput): Promise<void> {
        const repo = this.connection.getRepository(ctx, GrantedDiscount);
        const existing = await repo.findOne({ where: { erpId: input.erpId } });
        await repo.save(existing ? Object.assign(existing, input) : new GrantedDiscount(input));
    }
}
