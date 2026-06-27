import { Args, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { Permission } from '@vendure/common/lib/generated-types';
import { Allow, Ctx, RequestContext, Transaction } from '@vendure/core';

import { Counterparty } from './entities/counterparty.entity';
import { CounterpartyService } from './counterparty.service';

@Resolver('Customer')
export class CustomerCounterpartyResolver {
    constructor(private counterpartyService: CounterpartyService) {}

    @ResolveField()
    async counterparty(
        @Ctx() ctx: RequestContext,
        @Parent() customer: { id: string },
    ): Promise<Counterparty | null> {
        return this.counterpartyService.getForCustomer(ctx, customer.id);
    }
}

// tradingPoints field is resolved by CounterpartyTradingPointResolver in trading-point.resolver.ts

@Resolver('Counterparty')
export class CounterpartyResolver {
    constructor(private counterpartyService: CounterpartyService) {}

    @Query()
    @Allow(Permission.ReadCustomer)
    async counterparties(@Ctx() ctx: RequestContext): Promise<Counterparty[]> {
        return this.counterpartyService.findAll(ctx);
    }

    @Transaction()
    @Mutation()
    @Allow(Permission.UpdateCustomer)
    async upsertCounterparty(
        @Ctx() ctx: RequestContext,
        @Args()
        args: {
            erpId: string;
            legalName: string;
            shortName: string;
            inn?: string;
            creditLimit: number;
            creditBalance: number;
            paymentDelayDays: number;
            priceType: string;
            isActive: boolean;
        },
    ): Promise<Counterparty> {
        return this.counterpartyService.upsert(ctx, args);
    }

    @Transaction()
    @Mutation()
    @Allow(Permission.UpdateCustomer)
    async assignCustomerToCounterparty(
        @Ctx() ctx: RequestContext,
        @Args() args: { customerId: string; erpId: string; role: string },
    ): Promise<boolean> {
        await this.counterpartyService.setCustomerCounterparty(ctx, args.customerId, args.erpId);
        await this.counterpartyService.setCustomerRole(ctx, args.customerId, args.role);
        return true;
    }
}
