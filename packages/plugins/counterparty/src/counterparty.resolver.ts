import { Args, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { Permission } from '@vendure/common/lib/generated-types';
import { ID } from '@vendure/common/lib/shared-types';
import {
    Allow,
    Ctx,
    ForbiddenError,
    PaginatedList,
    RequestContext,
    Transaction,
} from '@vendure/core';
import { CustomPermission, PriceTypeAccessService } from '@mivend/plugin-access-control';

import type { CounterpartyListFilter } from './counterparty-list-filter';
import { Counterparty } from './entities/counterparty.entity';
import { CounterpartyManagerAssignmentService } from './counterparty-manager-assignment.service';
import { CounterpartyService } from './counterparty.service';
import { CounterpartySortParameter } from './types';

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

// creditLimit/creditBalance are plain schema fields, so requiresPermission doesn't apply here.
// @Allow() alone doesn't gate @ResolveField in this Vendure version, so check permission in the body.
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

// Null when the viewer may not see this type; the counterparty's own type is shown in its context
// when it is a customer type (never a confidential one).
@Resolver('Counterparty')
export class CounterpartyPriceTypeResolver {
    constructor(private priceTypeAccess: PriceTypeAccessService) {}

    @ResolveField()
    async priceType(
        @Ctx() ctx: RequestContext,
        @Parent() counterparty: Counterparty,
    ): Promise<string | null> {
        const allowed = await this.priceTypeAccess.isCodeAllowed(ctx, counterparty.priceType, {
            contextCodes: [counterparty.priceType],
        });
        return allowed ? counterparty.priceType : null;
    }
}

// Works without the activation feature: reports any existing link (e.g. legacy email-matched Customer),
// otherwise returns null.
@Resolver('Counterparty')
export class CounterpartyCustomerLinkResolver {
    constructor(private counterpartyService: CounterpartyService) {}

    @ResolveField()
    async linkedCustomerId(
        @Ctx() ctx: RequestContext,
        @Parent() counterparty: Counterparty,
    ): Promise<ID | null> {
        return this.counterpartyService.getLinkedCustomerId(ctx, counterparty.id);
    }

    @ResolveField()
    async innStatus(
        @Ctx() ctx: RequestContext,
        @Parent() counterparty: Counterparty,
    ): Promise<string> {
        return this.counterpartyService.getInnStatus(ctx, counterparty);
    }
}

@Resolver('Counterparty')
export class CounterpartyResolver {
    constructor(
        private counterpartyService: CounterpartyService,
        private managerAssignmentService: CounterpartyManagerAssignmentService,
        private priceTypeAccess: PriceTypeAccessService,
    ) {}

    @Query()
    @Allow(Permission.ReadCustomer, CustomPermission.ReadCounterparty.Permission)
    async counterparties(
        @Ctx() ctx: RequestContext,
        @Args()
        args: {
            options?: {
                take?: number;
                skip?: number;
                search?: string;
                status?: string;
                managerId?: ID;
                managerErpId?: string;
                branchId?: string;
                groupLabel?: string;
                unassignedOnly?: boolean;
                innStatus?: string;
                sort?: CounterpartySortParameter;
            };
        },
    ): Promise<PaginatedList<Counterparty>> {
        return this.counterpartyService.findVisiblePage(ctx, args.options ?? {});
    }

    // Dashboard "Unassigned clients" KPI tile.
    @Query()
    @Allow(Permission.ReadCustomer, CustomPermission.ReadCounterparty.Permission)
    async unassignedCounterpartyCount(@Ctx() ctx: RequestContext): Promise<number> {
        return this.counterpartyService.countUnassigned(ctx);
    }

    // The list is paginated, so a client-side id filter over it would miss entities beyond page one.
    @Query()
    @Allow(Permission.ReadCustomer, CustomPermission.ReadCounterparty.Permission)
    async counterparty(
        @Ctx() ctx: RequestContext,
        @Args() args: { id: string },
    ): Promise<Counterparty | null> {
        return this.counterpartyService.findOneVisible(ctx, args.id);
    }

    // Computing credit totals via plain SQL aggregate would bypass the ReadCounterpartyCredit gate.
    // Keep totalCreditBalance/highUsageCount behind ReadCounterpartyCredit, as in the field resolver.
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

    // Membership in this list leaks credit risk even without the numeric fields, so gate the whole query.
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
            erpGroupLabel?: string;
        },
    ): Promise<Counterparty> {
        await this.priceTypeAccess.assertCodeAllowed(ctx, args.priceType);
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
        return this.managerAssignmentService.reassignManager(
            ctx,
            args.counterpartyId,
            args.administratorId,
        );
    }

    @Transaction()
    @Mutation()
    @Allow(CustomPermission.ReassignCounterpartyManager.Permission)
    async reassignCounterpartyManagerByFilter(
        @Ctx() ctx: RequestContext,
        @Args()
        args: { filter: CounterpartyListFilter; administratorId: string; expectedCount: number },
    ): Promise<number> {
        return this.managerAssignmentService.reassignManagerByFilter(
            ctx,
            args.filter,
            args.administratorId,
            args.expectedCount,
        );
    }
}
