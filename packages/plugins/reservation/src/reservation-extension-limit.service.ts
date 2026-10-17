import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { In } from 'typeorm';

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

    // The most permissive limit among the roles; null when none of them has a row.
    async getMaxLimit(
        ctx: RequestContext,
        roleCodes: string[],
    ): Promise<ReservationExtensionLimit | null> {
        if (roleCodes.length === 0) return null;
        const rows = await this.connection
            .getRepository(ctx, ReservationExtensionLimit)
            .find({ where: { roleCode: In(roleCodes) } });
        return rows.reduce<ReservationExtensionLimit | null>(
            (best, row) => (!best || row.maxExtraDays > best.maxExtraDays ? row : best),
            null,
        );
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
