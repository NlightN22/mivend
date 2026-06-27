import { Args, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, RequestContext, Transaction, TransactionalConnection } from '@vendure/core';
import { Permission } from '@vendure/common/lib/generated-types';

import { TradingPoint } from './entities/trading-point.entity';
import { TradingPointService } from './trading-point.service';

@Resolver('Customer')
export class CustomerTradingPointResolver {
    constructor(private tradingPointService: TradingPointService) {}

    @ResolveField()
    async preferredTradingPoint(
        @Ctx() ctx: RequestContext,
        @Parent() customer: { id: string },
    ): Promise<TradingPoint | null> {
        return this.tradingPointService.getPreferredForCustomer(ctx, customer.id);
    }
}

@Resolver('Counterparty')
export class CounterpartyTradingPointResolver {
    constructor(private tradingPointService: TradingPointService) {}

    @ResolveField()
    async tradingPoints(
        @Ctx() ctx: RequestContext,
        @Parent() counterparty: { id: string },
    ): Promise<TradingPoint[]> {
        return this.tradingPointService.findByCounterparty(ctx, counterparty.id);
    }
}

@Resolver('TradingPoint')
export class TradingPointResolver {
    constructor(
        private tradingPointService: TradingPointService,
        private connection: TransactionalConnection,
    ) {}

    @Query()
    async tradingPoint(
        @Ctx() ctx: RequestContext,
        @Args() args: { id: string },
    ): Promise<TradingPoint | null> {
        return this.tradingPointService.findById(ctx, args.id);
    }

    @Transaction()
    @Mutation()
    async setPreferredTradingPoint(
        @Ctx() ctx: RequestContext,
        @Args() args: { tradingPointId: string },
    ): Promise<boolean> {
        if (!ctx.activeUserId) return false;
        const rows = await this.connection.rawConnection.query(
            `SELECT id FROM customer WHERE "userId" = $1 LIMIT 1`,
            [ctx.activeUserId],
        );
        const customerId: string | undefined = rows?.[0]?.id;
        if (!customerId) return false;
        await this.tradingPointService.setPreferred(ctx, customerId, args.tradingPointId);
        return true;
    }

    @Transaction()
    @Mutation()
    @Allow(Permission.UpdateCustomer)
    async updateTradingPointComment(
        @Ctx() ctx: RequestContext,
        @Args() args: { tradingPointId: string; comment: string | null },
    ): Promise<TradingPoint> {
        return this.tradingPointService.updateDeliveryComment(
            ctx,
            args.tradingPointId,
            args.comment,
        );
    }
}

@Resolver('TradingPoint')
export class TradingPointAdminResolver {
    constructor(private tradingPointService: TradingPointService) {}

    @Transaction()
    @Mutation()
    @Allow(Permission.UpdateCustomer)
    async upsertTradingPoint(
        @Ctx() ctx: RequestContext,
        @Args()
        args: {
            erpId: string;
            counterpartyErpId: string;
            name: string;
            address: string;
            latitude?: number;
            longitude?: number;
            workingHours?: string;
            isActive: boolean;
        },
    ): Promise<TradingPoint> {
        return this.tradingPointService.upsert(ctx, args);
    }
}
