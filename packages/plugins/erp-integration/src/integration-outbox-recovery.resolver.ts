import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, RequestContext } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

import { IntegrationOutboxRecoveryService } from './integration-outbox-recovery.service';
import type { RebuildOutcome } from './integration-outbox-recovery.service';

@Resolver()
export class IntegrationOutboxRecoveryResolver {
    constructor(private readonly recovery: IntegrationOutboxRecoveryService) {}

    @Mutation()
    @Allow(CustomPermission.ManageErpIntegration.Permission)
    async requeueFailedIntegrationOutbox(@Args() args: { ids: string[] }): Promise<number> {
        return this.recovery.requeueFailed(args.ids.map(Number));
    }

    @Mutation()
    @Allow(CustomPermission.ManageErpIntegration.Permission)
    async rebuildSkippedIntegrationOutbox(
        @Ctx() ctx: RequestContext,
        @Args() args: { id: string },
    ): Promise<RebuildOutcome> {
        return this.recovery.rebuildSkipped(ctx, Number(args.id));
    }
}
