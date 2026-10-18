import { Args, Query, Resolver } from '@nestjs/graphql';
import { Permission } from '@vendure/common/lib/generated-types';
import { Allow, Ctx, ListQueryOptions, PaginatedList, RequestContext } from '@vendure/core';

import { CustomPermission } from './custom-permission';
import { ErpPosition } from './entities/erp-position.entity';
import { ErpUser } from './entities/erp-user.entity';
import { ErpUserService } from './erp-user.service';
import { PositionService } from './position.service';

@Resolver()
export class ErpUserResolver {
    constructor(
        private erpUserService: ErpUserService,
        private positionService: PositionService,
    ) {}

    // Issue #119: unlinked ERP users awaiting a human decision — see ErpUser's own comment.
    @Query()
    @Allow(CustomPermission.ManageAdministratorLifecycle.Permission)
    async pendingErpUsers(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: ListQueryOptions<ErpUser> },
    ): Promise<PaginatedList<ErpUser & { position: string | null }>> {
        const page = await this.erpUserService.findAllPaginated(ctx, args.options);
        const names = await this.positionService.findNamesByErpIds(
            ctx,
            page.items.flatMap(u => (u.positionErpId ? [u.positionErpId] : [])),
        );
        const items = page.items.map(u =>
            Object.assign(u, { position: names.get(u.positionErpId ?? '') ?? null }),
        );
        return { items, totalItems: page.totalItems };
    }

    // View-only org-structure master data, same visibility as `departments`.
    @Query()
    @Allow(Permission.Authenticated)
    async positions(@Ctx() ctx: RequestContext): Promise<ErpPosition[]> {
        return this.positionService.findAll(ctx);
    }
}
