import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import { UnitRecord } from './entities/unit-record.entity';

// Handler depends only on this cache, not the live unit stream, to resolve defaultSalesUnitId.
@Injectable()
export class UnitLookupService {
    constructor(private readonly connection: TransactionalConnection) {}

    async findByEntityId(ctx: RequestContext, entityId: string): Promise<UnitRecord | null> {
        return this.connection.getRepository(ctx, UnitRecord).findOne({ where: { entityId } });
    }
}
