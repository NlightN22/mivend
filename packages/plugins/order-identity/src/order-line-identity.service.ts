import { Injectable } from '@nestjs/common';
import type { ID } from '@vendure/common/lib/shared-types';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { In } from 'typeorm';

import { OrderLineIdentity } from './entities/order-line-identity.entity';

@Injectable()
export class OrderLineIdentityService {
    constructor(private readonly connection: TransactionalConnection) {}

    async uuidsByLineId(ctx: RequestContext, lineIds: ID[]): Promise<Map<string, string>> {
        if (lineIds.length === 0) return new Map();
        const rows = await this.connection.getRepository(ctx, OrderLineIdentity).find({
            where: { orderLineId: In(lineIds.map(Number)) },
        });
        return new Map(rows.map(row => [String(row.orderLineId), row.uuid]));
    }
}
