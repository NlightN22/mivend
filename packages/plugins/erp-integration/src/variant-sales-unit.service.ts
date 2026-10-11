import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';

export interface VariantSalesUnitView {
    unitName: string | null;
    unitRatioToBase: number | null;
}

interface Batch {
    ids: Set<string>;
    result: Promise<Map<string, VariantSalesUnitView>>;
}

// Search results ask for the unit of every item in one tick; those lookups share one query.
@Injectable()
export class VariantSalesUnitService {
    private readonly batches = new WeakMap<RequestContext, Batch>();

    constructor(private readonly connection: TransactionalConnection) {}

    async load(ctx: RequestContext, variantId: string): Promise<VariantSalesUnitView | null> {
        let batch = this.batches.get(ctx);
        if (!batch) {
            const ids = new Set<string>();
            const result = Promise.resolve().then(() => {
                this.batches.delete(ctx);
                return this.fetch(ctx, [...ids]);
            });
            batch = { ids, result };
            this.batches.set(ctx, batch);
        }
        batch.ids.add(variantId);
        return (await batch.result).get(variantId) ?? null;
    }

    private async fetch(
        ctx: RequestContext,
        ids: string[],
    ): Promise<Map<string, VariantSalesUnitView>> {
        const rows = await this.connection
            .getRepository(ctx, 'product_variant')
            .createQueryBuilder('pv')
            .select('pv.id', 'id')
            .addSelect('pv."customFieldsUnitname"', 'unitName')
            .addSelect('pv."customFieldsUnitratiotobase"', 'unitRatioToBase')
            .where('pv.id IN (:...ids)', { ids })
            .getRawMany<{ id: string; unitName: string | null; unitRatioToBase: number | null }>();
        return new Map(
            rows.map(row => [
                String(row.id),
                { unitName: row.unitName ?? null, unitRatioToBase: row.unitRatioToBase ?? null },
            ]),
        );
    }
}
