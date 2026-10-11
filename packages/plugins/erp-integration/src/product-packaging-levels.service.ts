import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import { UnitRecord } from './entities/unit-record.entity';

export interface PackagingLevelView {
    name: string;
    ratioToBase: number;
}

// Product-owned packaging units (pack, pallet) from the unit stream's local cache, smallest first.
@Injectable()
export class ProductPackagingLevelsService {
    constructor(private readonly connection: TransactionalConnection) {}

    async getForProduct(ctx: RequestContext, productId: string): Promise<PackagingLevelView[]> {
        return (await this.getForProducts(ctx, [productId])).get(productId) ?? [];
    }

    async getForProducts(
        ctx: RequestContext,
        productIds: string[],
    ): Promise<Map<string, PackagingLevelView[]>> {
        const byProduct = new Map<string, PackagingLevelView[]>();
        if (productIds.length === 0) return byProduct;
        const rows = await this.connection
            .getRepository(ctx, UnitRecord)
            .createQueryBuilder('u')
            .innerJoin('product', 'p', 'p."customFieldsExternalid" = u."ownerId"')
            .select('p.id', 'productId')
            .addSelect('u.name', 'name')
            .addSelect('u."ratioToBase"', 'ratioToBase')
            .where('p.id IN (:...productIds)', { productIds })
            .andWhere('u."isDeleted" = false')
            .andWhere('u."ratioToBase" > 0 AND u."ratioToBase" <> 1')
            .orderBy('u."ratioToBase"', 'ASC')
            .getRawMany<{ productId: string | number; name: string; ratioToBase: number }>();
        for (const row of rows) {
            const key = String(row.productId);
            const levels = byProduct.get(key) ?? [];
            levels.push({ name: row.name, ratioToBase: Number(row.ratioToBase) });
            byProduct.set(key, levels);
        }
        return byProduct;
    }
}
