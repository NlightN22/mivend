import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import { UnitRecord } from './entities/unit-record.entity';

// Read side of the `unit` stream's local cache (see UnitRecord's own doc comment) — the only
// thing ProductStreamHandler needs to resolve ProductVariant.customFields.unitRatioToBase/
// unitWeightKg/unitVolumeM3 from ProductChanged.defaultSalesUnitId.
@Injectable()
export class UnitLookupService {
    constructor(private readonly connection: TransactionalConnection) {}

    async findByEntityId(ctx: RequestContext, entityId: string): Promise<UnitRecord | null> {
        return this.connection.getRepository(ctx, UnitRecord).findOne({ where: { entityId } });
    }
}
