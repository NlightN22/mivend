import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { In } from 'typeorm';

import { Contract } from './entities/contract.entity';
import { Counterparty } from './entities/counterparty.entity';

// Consumer paths resolve many ERP ids at once; a missing one is simply absent from the map.
@Injectable()
export class ErpIdLookupService {
    constructor(private connection: TransactionalConnection) {}

    async counterpartyIds(
        ctx: RequestContext,
        erpIds: Iterable<string>,
    ): Promise<Map<string, string>> {
        const ids = [...new Set(erpIds)];
        if (ids.length === 0) return new Map();
        const rows = await this.connection
            .getRepository(ctx, Counterparty)
            .find({ select: ['id', 'erpId'], where: { erpId: In(ids) } });
        return new Map(rows.map(row => [row.erpId, String(row.id)]));
    }

    async contractIds(ctx: RequestContext, erpIds: Iterable<string>): Promise<Map<string, string>> {
        const ids = [...new Set(erpIds)];
        if (ids.length === 0) return new Map();
        const rows = await this.connection
            .getRepository(ctx, Contract)
            .find({ select: ['id', 'erpId'], where: { erpId: In(ids) } });
        return new Map(rows.map(row => [row.erpId, String(row.id)]));
    }
}
