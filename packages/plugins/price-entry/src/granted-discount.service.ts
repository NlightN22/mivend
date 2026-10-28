import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import { withAggregateLock } from 'shared';

import { GrantedDiscount } from './granted-discount.entity';
import { isVersionNewer } from './granted-version-compare';

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

    // A tombstone wins a version tie (update + cancel can share one ERP timestamp).
    async remove(ctx: RequestContext, erpId: string, version: string): Promise<boolean> {
        return withAggregateLock(this.connection, ctx, `granted-discount:${erpId}`, async txCtx => {
            const repo = this.connection.getRepository(txCtx, GrantedDiscount);
            const existing = await repo.findOne({ where: { erpId } });
            if (!existing || isVersionNewer(existing.sourceVersion, version)) return false;
            await repo.save(Object.assign(existing, { isDeleted: true, sourceVersion: version }));
            return true;
        });
    }

    // Out-of-order protection against live rows is the inbox's own version guard; a deleted row is
    // only revived by a strictly newer version.
    async upsert(ctx: RequestContext, input: GrantedDiscountInput): Promise<void> {
        await withAggregateLock(
            this.connection,
            ctx,
            `granted-discount:${input.erpId}`,
            async txCtx => {
                const repo = this.connection.getRepository(txCtx, GrantedDiscount);
                const existing = await repo.findOne({ where: { erpId: input.erpId } });
                if (
                    existing?.isDeleted &&
                    !isVersionNewer(input.sourceVersion, existing.sourceVersion)
                ) {
                    return;
                }
                const values = { ...input, isDeleted: false };
                await repo.save(
                    existing ? Object.assign(existing, values) : new GrantedDiscount(values),
                );
            },
        );
    }
}
