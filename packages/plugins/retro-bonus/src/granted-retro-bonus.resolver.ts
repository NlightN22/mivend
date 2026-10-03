import { Args, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { ID } from '@vendure/common/lib/shared-types';
import {
    Allow,
    Ctx,
    ListQueryOptions,
    PaginatedList,
    Permission,
    RequestContext,
} from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';
import { CounterpartyService } from '@mivend/plugin-counterparty';

import { GrantedRetroBonus } from './granted-retro-bonus.entity';
import { GrantedRetroBonusService } from './granted-retro-bonus.service';
import { accrualKindLabel } from './accrual-kind-label';

@Resolver('GrantedRetroBonus')
export class GrantedRetroBonusFieldResolver {
    @ResolveField()
    accrualKindLabel(@Parent() bonus: GrantedRetroBonus): string | null {
        return bonus.accrualKind ? accrualKindLabel(bonus.accrualKind) : null;
    }
}

@Resolver()
export class GrantedRetroBonusResolver {
    constructor(
        private grantedRetroBonusService: GrantedRetroBonusService,
        private counterpartyService: CounterpartyService,
    ) {}

    @Query()
    @Allow(Permission.ReadCustomer, CustomPermission.ReadCounterparty.Permission)
    async grantedRetroBonuses(
        @Ctx() ctx: RequestContext,
        @Args() args: { counterpartyId: ID; options?: ListQueryOptions<GrantedRetroBonus> },
    ): Promise<PaginatedList<GrantedRetroBonus>> {
        const counterparty = await this.counterpartyService.findOneVisible(
            ctx,
            args.counterpartyId,
        );
        if (!counterparty) return { items: [], totalItems: 0 };
        return this.grantedRetroBonusService.findForRecipient(
            ctx,
            counterparty.erpId,
            args.options,
        );
    }
}
