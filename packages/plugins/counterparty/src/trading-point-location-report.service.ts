import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import type { SelectQueryBuilder } from 'typeorm';
import { ctxQuery } from 'shared';

import { TradingPoint } from './entities/trading-point.entity';
import { TradingPointErp } from './entities/trading-point-erp.entity';
import { noLocationSql } from './trading-point-location';

const MISSING = `"isActive" = true AND ${noLocationSql('')}`;

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
            .where(`tp."isActive" = true AND ${noLocationSql('tp.')}`)
            .orderBy('tp.id', 'ASC')
            .take(take)
            .skip(options.skip ?? 0)
            .getManyAndCount();
        return { items, totalItems };
    }

    // Points whose mivend record has moved away from what the ERP last sent (the expected result of a person's edit).
    async listDifferingFromErp(
        ctx: RequestContext,
        options: { take?: number; skip?: number } = {},
    ): Promise<{ items: TradingPoint[]; totalItems: number }> {
        return this.page(
            this.connection
                .getRepository(ctx, TradingPoint)
                .createQueryBuilder('tp')
                .innerJoin(TradingPointErp, 'm', 'm."erpId" = tp."erpId"')
                .where(
                    `(tp.name IS DISTINCT FROM m.name OR tp.address IS DISTINCT FROM m.address
                      OR tp."workingHours" IS DISTINCT FROM m."workingHours"
                      OR tp.latitude IS DISTINCT FROM m.latitude OR tp.longitude IS DISTINCT FROM m.longitude)`,
                ),
            options,
        );
    }

    // Points the ERP has never sent: created by a customer here and still waiting to reach the ERP.
    async listNotConfirmedByErp(
        ctx: RequestContext,
        options: { take?: number; skip?: number } = {},
    ): Promise<{ items: TradingPoint[]; totalItems: number }> {
        return this.page(
            this.connection
                .getRepository(ctx, TradingPoint)
                .createQueryBuilder('tp')
                .where(
                    `NOT EXISTS (SELECT 1 FROM trading_point_erp m WHERE m."erpId" = tp."erpId")`,
                ),
            options,
        );
    }

    private async page(
        qb: SelectQueryBuilder<TradingPoint>,
        options: { take?: number; skip?: number },
    ): Promise<{ items: TradingPoint[]; totalItems: number }> {
        const [items, totalItems] = await qb
            .orderBy('tp.id', 'ASC')
            .take(Math.min(options.take ?? 50, 200))
            .skip(options.skip ?? 0)
            .getManyAndCount();
        return { items, totalItems };
    }
}
