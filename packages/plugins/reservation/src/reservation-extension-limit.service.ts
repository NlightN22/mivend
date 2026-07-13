import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import { ReservationExtensionLimit } from './entities/reservation-extension-limit.entity';

@Injectable()
export class ReservationExtensionLimitService {
    constructor(private connection: TransactionalConnection) {}

    async getLimit(
        ctx: RequestContext,
        roleCode: string,
    ): Promise<ReservationExtensionLimit | null> {
        return this.connection
            .getRepository(ctx, ReservationExtensionLimit)
            .findOne({ where: { roleCode } });
    }

    async setLimit(
        ctx: RequestContext,
        roleCode: string,
        maxExtraDays: number,
    ): Promise<ReservationExtensionLimit> {
        const repo = this.connection.getRepository(ctx, ReservationExtensionLimit);
        let row = await repo.findOne({ where: { roleCode } });
        if (row) {
            row.maxExtraDays = maxExtraDays;
        } else {
            row = repo.create({ roleCode, maxExtraDays });
        }
        return repo.save(row);
    }
}
