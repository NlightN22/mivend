import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import { EventBus, RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';
import { ctxQuery } from 'shared';

import { CounterpartyService } from './counterparty.service';
import { TradingPoint } from './entities/trading-point.entity';
import { TradingPointChange } from './entities/trading-point-change.entity';
import { TradingPointChangeAcceptedEvent } from './trading-point-change.events';
import { parsePayload } from './trading-point-change';
import { TradingPointService } from './trading-point.service';

const MAX_COMMENT_LENGTH = 500;

// A manager decides a customer's proposed edit of an ERP-confirmed point; acceptance goes through the staff edit path.
@Injectable()
export class TradingPointChangeService {
    constructor(
        private connection: TransactionalConnection,
        private tradingPoints: TradingPointService,
        private counterparties: CounterpartyService,
        private eventBus: EventBus,
    ) {}

    findPending(ctx: RequestContext, tradingPointId: ID): Promise<TradingPointChange | null> {
        return this.connection
            .getRepository(ctx, TradingPointChange)
            .findOne({ where: { tradingPointId: String(tradingPointId), status: 'pending' } });
    }

    async listPending(ctx: RequestContext): Promise<TradingPointChange[]> {
        const qb = this.connection
            .getRepository(ctx, TradingPointChange)
            .createQueryBuilder('c')
            .where('c.status = :status', { status: 'pending' });
        const visible = await this.counterparties.visibleErpIdsSql(ctx);
        if (visible) {
            qb.andWhere(
                `c."counterpartyId" IN (SELECT cp.id::varchar FROM counterparty cp WHERE cp."erpId" IN (${visible.sql}))`,
                visible.params,
            );
        }
        return qb.orderBy('c.id', 'ASC').take(200).getMany();
    }

    async accept(ctx: RequestContext, id: ID): Promise<TradingPointChange> {
        const change = await this.lockPending(ctx, id);
        const point = await this.connection
            .getRepository(ctx, TradingPoint)
            .findOne({ where: { id: change.tradingPointId } });
        if (!point) throw new UserInputError('Trading point not found');
        const p = parsePayload(change);
        await this.tradingPoints.updateDetails(ctx, point.id, {
            name: p.name,
            address: p.address,
            latitude: p.latitude,
            longitude: p.longitude,
            workingHours: p.workingHours,
            contacts:
                p.contactName === undefined
                    ? undefined
                    : p.contactName
                      ? [{ name: p.contactName, phone: p.contactPhone ?? null, isPrimary: true }]
                      : [],
        });
        const rows = await ctxQuery<Array<{ v: number }>>(
            this.connection,
            ctx,
            `SELECT COALESCE(MAX(version), 0) + 1 AS v FROM trading_point_change WHERE "tradingPointId" = $1`,
            [change.tradingPointId],
        );
        change.status = 'accepted';
        change.version = Number(rows[0].v);
        await this.markDecided(ctx, change);
        this.eventBus.publish(
            new TradingPointChangeAcceptedEvent(ctx, point.uuid, change.uuid, change.version),
        );
        return change;
    }

    async reject(
        ctx: RequestContext,
        id: ID,
        comment?: string | null,
    ): Promise<TradingPointChange> {
        if (comment && comment.length > MAX_COMMENT_LENGTH) {
            throw new UserInputError(`The comment is longer than ${MAX_COMMENT_LENGTH} characters`);
        }
        const change = await this.lockPending(ctx, id);
        change.status = 'rejected';
        change.comment = comment ?? null;
        return this.markDecided(ctx, change);
    }

    // Same order as the customer edit path: the point row first, then the change row.
    private async lockPending(ctx: RequestContext, id: ID): Promise<TradingPointChange> {
        const repo = this.connection.getRepository(ctx, TradingPointChange);
        const unlocked = await repo.findOne({ where: { id: String(id) } });
        if (!unlocked) throw new UserInputError(`Trading point change not found: id=${id}`);
        await ctxQuery(
            this.connection,
            ctx,
            `SELECT id FROM trading_point WHERE id = $1 FOR UPDATE`,
            [unlocked.tradingPointId],
        );
        await ctxQuery(
            this.connection,
            ctx,
            `SELECT id FROM trading_point_change WHERE id = $1 FOR UPDATE`,
            [String(id)],
        );
        const change = await repo.findOne({ where: { id: String(id) } });
        if (!change) throw new UserInputError(`Trading point change not found: id=${id}`);
        if (change.status !== 'pending') {
            throw new UserInputError('The change is already decided');
        }
        const visible = await this.counterparties.findOneVisible(ctx, change.counterpartyId);
        if (!visible) throw new UserInputError(`Trading point change not found: id=${id}`);
        return change;
    }

    private markDecided(
        ctx: RequestContext,
        change: TradingPointChange,
    ): Promise<TradingPointChange> {
        change.decidedByUserId = ctx.activeUserId ? String(ctx.activeUserId) : null;
        change.decidedAt = new Date();
        return this.connection.getRepository(ctx, TradingPointChange).save(change);
    }
}
