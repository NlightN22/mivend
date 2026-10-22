import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import type { PriceTypeRecord } from '../types';

@Injectable()
export class PriceTypeHandler {
    constructor(private readonly connection: TransactionalConnection) {}

    async upsert(ctx: RequestContext, record: PriceTypeRecord): Promise<void> {
        if (record.visibility !== 'customer' && record.visibility !== 'confidential')
            throw new Error(`Price type ${record.code}: unknown visibility "${record.visibility}"`);
        const manager = this.connection.getRepository(ctx, 'Channel').manager;
        const isPurchase = record.isPurchase === true;
        // At most one purchase type: IDX_price_type_single_purchase.
        if (isPurchase)
            await manager
                .createQueryBuilder()
                .update('price_type')
                .set({ isPurchase: false, ceilingMultiplier: null })
                .where('"isPurchase" = true AND code <> :code', { code: record.code })
                .execute();
        await manager
            .createQueryBuilder()
            .insert()
            .into('price_type')
            .values({
                code: record.code,
                name: record.name,
                isActive: true,
                visibility: record.visibility,
                isPurchase,
                ceilingMultiplier: isPurchase ? (record.ceilingMultiplier ?? null) : null,
            })
            .orUpdate(
                ['name', 'isActive', 'visibility', 'isPurchase', 'ceilingMultiplier'],
                ['code'],
            )
            .execute();
    }
}
