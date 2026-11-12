import { Args, Query, Resolver } from '@nestjs/graphql';
import { ID } from '@vendure/common/lib/shared-types';
import { Allow, Ctx, PaginatedList, Permission, RequestContext } from '@vendure/core';

import { DiscountSetupListService } from './discount-setup-list.service';
import type {
    DiscountSetupCounts,
    DiscountSetupListOptions,
    DiscountSetupRow,
} from './discount-setup-list.types';

@Resolver()
export class DiscountSetupResolver {
    constructor(private listService: DiscountSetupListService) {}

    @Query()
    @Allow(Permission.ReadCatalog)
    discountSetups(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: DiscountSetupListOptions },
    ): Promise<PaginatedList<DiscountSetupRow>> {
        return this.listService.findVisible(ctx, args.options ?? {});
    }

    @Query()
    @Allow(Permission.ReadCatalog)
    discountSetupCounts(
        @Ctx() ctx: RequestContext,
        @Args() args: { counterpartyId?: ID },
    ): Promise<DiscountSetupCounts> {
        return this.listService.counts(ctx, args.counterpartyId);
    }
}
