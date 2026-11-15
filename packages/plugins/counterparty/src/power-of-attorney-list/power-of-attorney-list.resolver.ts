import { Args, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, RequestContext } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

import type { PowerOfAttorneyListInput } from './power-of-attorney-list-query';
import { PowerOfAttorneyListService } from './power-of-attorney-list.service';
import type { PowerOfAttorneyPage } from './power-of-attorney-list.types';

@Resolver()
export class PowerOfAttorneyListResolver {
    constructor(private readonly service: PowerOfAttorneyListService) {}

    @Query()
    @Allow(CustomPermission.ReadCounterparty.Permission)
    visiblePowersOfAttorney(
        @Ctx() ctx: RequestContext,
        @Args() args: { list?: PowerOfAttorneyListInput },
    ): Promise<PowerOfAttorneyPage> {
        return this.service.findVisible(ctx, args.list);
    }
}
