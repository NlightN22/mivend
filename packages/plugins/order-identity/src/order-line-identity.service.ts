import { Injectable } from '@nestjs/common';
import type { ID } from '@vendure/common/lib/shared-types';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { findBounded } from 'shared';
import { In } from 'typeorm';

import { OrderLineIdentity } from './entities/order-line-identity.entity';

@Injectable()
export class OrderLineIdentityService {
    constructor(private readonly connection: TransactionalConnection) {}

    async uuidsByLineId(ctx: RequestContext, lineIds: ID[]): Promise<Map<string, string>> {
        if (lineIds.length === 0) return new Map();
        const rows = await findBounded(
            this.connection.getRepository(ctx, OrderLineIdentity),
            { where: { orderLineId: In(lineIds.map(Number)) } },
            lineIds.length,
        );
        return new Map(rows.map(row => [String(row.orderLineId), row.uuid]));
    }
}
