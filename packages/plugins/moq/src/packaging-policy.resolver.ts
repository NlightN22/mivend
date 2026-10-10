import { Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, CustomerService, Permission, RequestContext } from '@vendure/core';

import { PackagingPolicyService } from './packaging-policy.service';

@Resolver()
export class PackagingPolicyShopResolver {
    constructor(
        private readonly packagingPolicyService: PackagingPolicyService,
        private readonly customerService: CustomerService,
    ) {}

    @Query()
    @Allow(Permission.Authenticated)
    async packagesOnlySales(@Ctx() ctx: RequestContext): Promise<boolean> {
        const customer = ctx.activeUserId
            ? await this.customerService.findOneByUserId(ctx, ctx.activeUserId)
            : undefined;
        return this.packagingPolicyService.isPackagesOnly(ctx, customer?.id);
    }
}
