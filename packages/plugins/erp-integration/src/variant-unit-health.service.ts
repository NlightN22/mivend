import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface VariantUnitHealth {
    total: number;
    unitMissing: number;
}

// Variants that name a default sales unit (soft link, ProductChanged.defaultSalesUnitId) among all
// variants that name one; unitMissing counts those whose unit has not arrived on the `unit` stream.
@Injectable()
export class VariantUnitHealthService {
    constructor(private readonly dataSource: DataSource) {}

    async getHealth(): Promise<VariantUnitHealth> {
        const [row] = await this.dataSource.query(`
            SELECT COUNT(*)::int AS total,
                   COUNT(*) FILTER (WHERE u.id IS NULL)::int AS "unitMissing"
              FROM product_variant v
              LEFT JOIN unit_record u ON u."entityId" = v."customFieldsDefaultsalesunitid"
             WHERE v."deletedAt" IS NULL AND v."customFieldsDefaultsalesunitid" IS NOT NULL
        `);
        return row;
    }
}
