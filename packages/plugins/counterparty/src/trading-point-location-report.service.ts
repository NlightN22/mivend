import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import type { SelectQueryBuilder } from 'typeorm';
import { ctxQuery, getPageAndCount } from 'shared';

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
        const qb = this.connection
            .getRepository(ctx, TradingPoint)
            .createQueryBuilder('tp')
            .where(`tp."isActive" = true AND ${noLocationSql('tp.')}`)
            .orderBy('tp.id', 'ASC');
        return getPageAndCount(qb, take, options.skip ?? 0);
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
        return getPageAndCount(
            qb.orderBy('tp.id', 'ASC'),
            Math.min(options.take ?? 50, 200),
            options.skip ?? 0,
        );
    }
}
