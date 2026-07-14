import { Args, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { Permission } from '@vendure/common/lib/generated-types';
import {
    Allow,
    Ctx,
    ForbiddenError,
    PaginatedList,
    RequestContext,
    Transaction,
} from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

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

// creditLimit/creditBalance are plain plugin-schema fields, not Vendure customFields, so
// declarative requiresPermission doesn't apply — this is the documented fallback (see
// docs/access-control.md, layer 4): a dedicated field resolver, registered only for the admin
// API, that never lets the value leave the service layer for an unauthorized caller.
//
// @Allow() alone does NOT reliably gate a @ResolveField in this Vendure version — verified
// live against a running dev server: a "manager" administrator (lacking
// ReadCounterpartyCredit) still received the real creditLimit/creditBalance values with only
// @Allow() attached, no ForbiddenError. Vendure's field-resolver auth path
// (DefaultEntityAccessControlStrategy, @since 3.6.0, marked @experimental) evidently isn't
// wired through the same guard pipeline as root Query/Mutation resolvers here — so the
// permission check is done explicitly in the resolver body instead of relying on the guard.
@Resolver('Counterparty')
export class CounterpartyCreditResolver {
    @ResolveField()
    creditLimit(@Ctx() ctx: RequestContext, @Parent() counterparty: Counterparty): number {
        this.assertCanReadCredit(ctx);
        return counterparty.creditLimit;
    }

    @ResolveField()
    creditBalance(@Ctx() ctx: RequestContext, @Parent() counterparty: Counterparty): number {
        this.assertCanReadCredit(ctx);
        return counterparty.creditBalance;
    }

    private assertCanReadCredit(ctx: RequestContext): void {
        if (!ctx.userHasPermissions([CustomPermission.ReadCounterpartyCredit.Permission])) {
            throw new ForbiddenError();
        }
    }
}

@Resolver('Counterparty')
export class CounterpartyResolver {
    constructor(private counterpartyService: CounterpartyService) {}

    @Query()
    @Allow(Permission.ReadCustomer, CustomPermission.ReadCounterparty.Permission)
    async counterparties(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: { take?: number; skip?: number; search?: string } },
    ): Promise<PaginatedList<Counterparty>> {
        return this.counterpartyService.findVisiblePage(ctx, args.options ?? {});
    }

    // Customer Detail page (docs/ai/manager-portal-pages/06-customer-detail.md) — a dedicated
    // single-entity lookup so the detail page no longer depends on fetching the full (now
    // paginated) `counterparties` list and filtering client-side by id, see issue #39.
    @Query()
    @Allow(Permission.ReadCustomer, CustomPermission.ReadCounterparty.Permission)
    async counterparty(
        @Ctx() ctx: RequestContext,
        @Args() args: { id: string },
    ): Promise<Counterparty | null> {
        return this.counterpartyService.findOneVisible(ctx, args.id);
    }

    // totalCount/activeCount are visible to any caller with ReadCounterparty (same as the list
    // itself); totalCreditBalance/highUsageCount are credit-derived and must stay behind
    // ReadCounterpartyCredit — same field-gating convention as CounterpartyCreditResolver above.
    // Computing them via a plain SQL aggregate here (instead of the Counterparty.creditLimit/
    // creditBalance @ResolveField) would otherwise silently bypass that gate entirely: a caller
    // without ReadCounterpartyCredit could read the company-wide credit total even though they
    // can't read any single customer's credit fields. Caught by
    // counterparty.access-scope.test.ts's permission test, not by any type-level check.
    @Query()
    @Allow(Permission.ReadCustomer, CustomPermission.ReadCounterparty.Permission)
    async counterpartySummary(@Ctx() ctx: RequestContext): Promise<{
        totalCount: number;
        activeCount: number;
        totalCreditBalance: number | null;
        highUsageCount: number | null;
    }> {
        const summary = await this.counterpartyService.getSummary(ctx);
        const canReadCredit = ctx.userHasPermissions([
            CustomPermission.ReadCounterpartyCredit.Permission,
        ]);
        return {
            totalCount: summary.totalCount,
            activeCount: summary.activeCount,
            totalCreditBalance: canReadCredit ? summary.totalCreditBalance : null,
            highUsageCount: canReadCredit ? summary.highUsageCount : null,
        };
    }

    // Membership in this list is itself credit-derived information ("this named customer is at
    // high credit risk") even without exposing the numeric creditLimit/creditBalance fields — so
    // the whole query is gated, not just those two fields, same "hide, don't leak" reasoning as
    // findOneVisible.
    @Query()
    @Allow(Permission.ReadCustomer, CustomPermission.ReadCounterparty.Permission)
    async highUsageCounterparties(
        @Ctx() ctx: RequestContext,
        @Args() args: { limit: number },
    ): Promise<Counterparty[]> {
        if (!ctx.userHasPermissions([CustomPermission.ReadCounterpartyCredit.Permission])) {
            return [];
        }
        return this.counterpartyService.findHighUsage(ctx, args.limit);
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
            departmentId?: string;
            branchId?: string;
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

    @Transaction()
    @Mutation()
    @Allow(CustomPermission.ReassignCounterpartyManager.Permission)
    async reassignCounterpartyManager(
        @Ctx() ctx: RequestContext,
        @Args() args: { counterpartyId: string; administratorId: string },
    ): Promise<Counterparty> {
        return this.counterpartyService.reassignManager(
            ctx,
            args.counterpartyId,
            args.administratorId,
        );
    }
}
