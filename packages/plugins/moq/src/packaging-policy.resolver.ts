import { Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, CustomerService, Order, Permission, RequestContext } from '@vendure/core';

import { PackagingPolicyService } from './packaging-policy.service';

@Resolver()
export class PackagingPolicyShopResolver {
    constructor(
        private readonly packagingPolicyService: PackagingPolicyService,
        private readonly customerService: CustomerService,
    ) {}

    @Query()
    @Allow(Permission.Public)
    async packagesOnlySales(@Ctx() ctx: RequestContext): Promise<boolean> {
        const customer = ctx.activeUserId
            ? await this.customerService.findOneByUserId(ctx, ctx.activeUserId)
            : undefined;
        return this.packagingPolicyService.isPackagesOnly(ctx, customer?.id);
    }
}

@Resolver('Order')
export class OrderPackagesOnlyAdminResolver {
    constructor(private readonly packagingPolicyService: PackagingPolicyService) {}

    @ResolveField()
    packagesOnlySales(@Ctx() ctx: RequestContext, @Parent() order: Order): Promise<boolean> {
        const placedBranchId = order.customFields?.branchId ?? null;
        return this.packagingPolicyService.isPackagesOnly(
            ctx,
            placedBranchId ? null : order.customerId,
            placedBranchId,
        );
    }
}
