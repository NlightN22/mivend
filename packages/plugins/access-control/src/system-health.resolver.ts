import { Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, RequestContext } from '@vendure/core';

import { CustomPermission } from './custom-permission';
import { SystemHealthCheckItem, SystemHealthService } from './system-health.service';

@Resolver()
export class SystemHealthResolver {
    constructor(private systemHealthService: SystemHealthService) {}

    @Query()
    @Allow(CustomPermission.ManageAccessControl.Permission)
    async systemHealthChecklist(@Ctx() ctx: RequestContext): Promise<SystemHealthCheckItem[]> {
        return this.systemHealthService.checklist(ctx);
    }
}
