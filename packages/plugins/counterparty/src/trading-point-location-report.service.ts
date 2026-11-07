import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { ctxQuery } from 'shared';

import { TradingPoint } from './entities/trading-point.entity';

const NO_LOCATION = (a: string): string =>
    `(${a}latitude IS NULL OR ${a}longitude IS NULL OR (${a}latitude = 0 AND ${a}longitude = 0)
      OR ${a}latitude NOT BETWEEN -90 AND 90 OR ${a}longitude NOT BETWEEN -180 AND 180)`;
const MISSING = `"isActive" = true AND ${NO_LOCATION('')}`;

// Unscoped system report for the ERP drift check; the points are ERP-owned or legacy, awaiting backfill.
@Injectable()
export class TradingPointLocationReportService {
    constructor(private connection: TransactionalConnection) {}

    async countMissing(ctx: RequestContext): Promise<number> {
        const rows = await ctxQuery<Array<{ n: string }>>(
            this.connection,
            ctx,
            `SELECT COUNT(*)::text AS n FROM trading_point WHERE ${MISSING}`,
        );
        return Number(rows[0]?.n ?? 0);
    }

    async listMissing(
        ctx: RequestContext,
        options: { take?: number; skip?: number } = {},
    ): Promise<{ items: TradingPoint[]; totalItems: number }> {
        const take = Math.min(options.take ?? 50, 200);
        const [items, totalItems] = await this.connection
            .getRepository(ctx, TradingPoint)
            .createQueryBuilder('tp')
            .where(`tp."isActive" = true AND ${NO_LOCATION('tp.')}`)
            .orderBy('tp.id', 'ASC')
            .take(take)
            .skip(options.skip ?? 0)
            .getManyAndCount();
        return { items, totalItems };
    }
}
