import { Args, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { Transaction } from '@vendure/core';
import { Allow, Ctx, RequestContext, TransactionalConnection } from '@vendure/core';
import { Permission } from '@vendure/common/lib/generated-types';
import { AccessScopeService, CustomPermission } from '@mivend/plugin-access-control';

import { TradingPoint } from './entities/trading-point.entity';
import {
    TradingPointService,
    CustomerTradingPointInput,
    TradingPointDetailsPatch,
} from './trading-point.service';
import { CounterpartyService } from './counterparty.service';
import { hiddenOnAdmin } from './hidden-on-admin';
import { ctxQuery } from 'shared';

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
    constructor(
        private tradingPointService: TradingPointService,
        private counterpartyService: CounterpartyService,
    ) {}

    @ResolveField()
    async tradingPoints(
        @Ctx() ctx: RequestContext,
        @Parent() counterparty: { id: string },
    ): Promise<TradingPoint[]> {
        if (await hiddenOnAdmin(this.counterpartyService, ctx, counterparty.id)) return [];
        return this.tradingPointService.findByCounterparty(ctx, counterparty.id);
    }
}

@Resolver('TradingPoint')
export class TradingPointResolver {
    constructor(
        private tradingPointService: TradingPointService,
        private connection: TransactionalConnection,
    ) {}

    @Transaction()
    @Mutation()
    async setPreferredTradingPoint(
        @Ctx() ctx: RequestContext,
        @Args() args: { tradingPointId: string },
    ): Promise<boolean> {
        if (!ctx.activeUserId) return false;
        const rows = await ctxQuery<Array<{ id: string }>>(
            this.connection,
            ctx,
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
    async tradingPoint(
        @Ctx() ctx: RequestContext,
        @Args() args: { id: string },
    ): Promise<TradingPoint | null> {
        return this.tradingPointService.findOwnById(ctx, args.id);
    }

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
    constructor(
        private tradingPointService: TradingPointService,
        private counterpartyService: CounterpartyService,
        private accessScopeService: AccessScopeService,
    ) {}

    // Read-time branch (#263): a branch scope also reads points serviced by its branch, so the
    // default branch reads the points of a branch-less client. Writes stay counterparty-scoped.
    @Query()
    @Allow(Permission.ReadCustomer, CustomPermission.ReadCounterparty.Permission)
    async tradingPoint(
        @Ctx() ctx: RequestContext,
        @Args() args: { id: string },
    ): Promise<TradingPoint | null> {
        const point = await this.tradingPointService.findById(ctx, args.id);
        if (!point) return null;
        if (await this.counterpartyService.findOneVisible(ctx, point.counterpartyId)) return point;
        const scope = await this.accessScopeService.resolveCounterpartyScope(ctx);
        if (scope.kind !== 'department' || !scope.branchId) return null;
        const branchId = await this.tradingPointService.resolveServicingBranchId(ctx, point);
        return branchId === scope.branchId ? point : null;
    }

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

    // Gated by the same permission pair as the counterparties query, not Permission.UpdateCustomer;
    // Scope is enforced in TradingPointService via AccessScopeService.assertCounterpartyWritable.
    @Transaction()
    @Mutation()
    @Allow(Permission.ReadCustomer, CustomPermission.ReadCounterparty.Permission)
    async updateTradingPointDetails(
        @Ctx() ctx: RequestContext,
        @Args() args: { id: string; input: TradingPointDetailsPatch },
    ): Promise<TradingPoint> {
        return this.tradingPointService.updateDetails(ctx, args.id, args.input);
    }

    @Transaction()
    @Mutation()
    @Allow(Permission.ReadCustomer, CustomPermission.ReadCounterparty.Permission)
    async setTradingPointActive(
        @Ctx() ctx: RequestContext,
        @Args() args: { id: string; isActive: boolean },
    ): Promise<TradingPoint> {
        return this.tradingPointService.setActive(ctx, args.id, args.isActive);
    }
}
