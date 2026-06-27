import { Args, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { Transaction } from '@vendure/core';
import { Allow, Ctx, RequestContext, TransactionalConnection } from '@vendure/core';
import { Permission } from '@vendure/common/lib/generated-types';

import { TradingPoint } from './entities/trading-point.entity';
import { TradingPointService, CustomerTradingPointInput } from './trading-point.service';

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

@Resolver('Query')
export class CustomerTradingPointsQueryResolver {
    constructor(private tradingPointService: TradingPointService) {}

    @Query()
    async myTradingPoints(@Ctx() ctx: RequestContext): Promise<TradingPoint[]> {
        const counterpartyId = await this.tradingPointService.getCounterpartyIdForUser(ctx);
        if (!counterpartyId) return [];
        return this.tradingPointService.findVisibleForCounterparty(ctx, counterpartyId);
    }

    @Query()
    async myHiddenTradingPoints(@Ctx() ctx: RequestContext): Promise<TradingPoint[]> {
        const counterpartyId = await this.tradingPointService.getCounterpartyIdForUser(ctx);
        if (!counterpartyId) return [];
        return this.tradingPointService.findHiddenForCounterparty(ctx, counterpartyId);
    }
}

@Resolver('Mutation')
export class CustomerTradingPointsMutationResolver {
    constructor(private tradingPointService: TradingPointService) {}

    @Transaction()
    @Mutation()
    async customerAddTradingPoint(
        @Ctx() ctx: RequestContext,
        @Args() args: CustomerTradingPointInput,
    ): Promise<TradingPoint | null> {
        const counterpartyId = await this.tradingPointService.getCounterpartyIdForUser(ctx);
        if (!counterpartyId) return null;
        return this.tradingPointService.customerAdd(ctx, counterpartyId, args);
    }

    @Transaction()
    @Mutation()
    async customerEditTradingPoint(
        @Ctx() ctx: RequestContext,
        @Args() args: { id: string } & CustomerTradingPointInput,
    ): Promise<TradingPoint | null> {
        const counterpartyId = await this.tradingPointService.getCounterpartyIdForUser(ctx);
        if (!counterpartyId) return null;
        const { id, ...input } = args;
        return this.tradingPointService.customerEdit(ctx, id, counterpartyId, input);
    }

    @Transaction()
    @Mutation()
    async customerDeleteTradingPoint(
        @Ctx() ctx: RequestContext,
        @Args() args: { id: string },
    ): Promise<boolean> {
        const counterpartyId = await this.tradingPointService.getCounterpartyIdForUser(ctx);
        if (!counterpartyId) return false;
        return this.tradingPointService.customerDelete(ctx, args.id, counterpartyId);
    }

    @Transaction()
    @Mutation()
    async customerRestoreTradingPoint(
        @Ctx() ctx: RequestContext,
        @Args() args: { id: string },
    ): Promise<TradingPoint | null> {
        const counterpartyId = await this.tradingPointService.getCounterpartyIdForUser(ctx);
        if (!counterpartyId) return null;
        return this.tradingPointService.customerRestore(ctx, args.id, counterpartyId);
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
