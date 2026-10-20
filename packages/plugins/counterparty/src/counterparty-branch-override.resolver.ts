import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { ID } from '@vendure/common/lib/shared-types';
import { Allow, Ctx, RequestContext, Transaction } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

import { CounterpartyBranchOverrideService } from './counterparty-branch-override.service';

@Resolver()
export class CounterpartyBranchOverrideResolver {
    constructor(private overrideService: CounterpartyBranchOverrideService) {}

    @Transaction()
    @Mutation()
    @Allow(CustomPermission.ManageAccessControl.Permission)
    async setCounterpartyBranchOverride(
        @Ctx() ctx: RequestContext,
        @Args() args: { counterpartyId: ID; branchId?: string | null },
    ): Promise<boolean> {
        await this.overrideService.setOverride(ctx, args.counterpartyId, args.branchId ?? null);
        return true;
    }
}
