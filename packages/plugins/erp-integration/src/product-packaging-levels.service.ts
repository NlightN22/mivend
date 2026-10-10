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
        const rows = await this.connection
            .getRepository(ctx, UnitRecord)
            .createQueryBuilder('u')
            .innerJoin('product', 'p', 'p."customFieldsExternalid" = u."ownerId"')
            .select('u.name', 'name')
            .addSelect('u."ratioToBase"', 'ratioToBase')
            .where('p.id = :productId', { productId })
            .andWhere('u."isDeleted" = false')
            .andWhere('u."ratioToBase" > 0 AND u."ratioToBase" <> 1')
            .orderBy('u."ratioToBase"', 'ASC')
            .getRawMany<PackagingLevelView>();
        return rows.map(row => ({ name: row.name, ratioToBase: Number(row.ratioToBase) }));
    }
}
