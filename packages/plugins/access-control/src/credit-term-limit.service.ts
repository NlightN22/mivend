import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import { CreditTermLimit } from './entities/credit-term-limit.entity';

@Injectable()
export class CreditTermLimitService {
    constructor(private connection: TransactionalConnection) {}

    async getLimit(ctx: RequestContext, roleCode: string): Promise<CreditTermLimit | null> {
        return this.connection.getRepository(ctx, CreditTermLimit).findOne({ where: { roleCode } });
    }

    async setLimit(
        ctx: RequestContext,
        roleCode: string,
        maxExtraDays: number,
        maxAmount: number | null,
    ): Promise<CreditTermLimit> {
        const repo = this.connection.getRepository(ctx, CreditTermLimit);
        let row = await repo.findOne({ where: { roleCode } });
        if (row) {
            row.maxExtraDays = maxExtraDays;
            row.maxAmount = maxAmount;
        } else {
            row = repo.create({ roleCode, maxExtraDays, maxAmount });
        }
        return repo.save(row);
    }
}
