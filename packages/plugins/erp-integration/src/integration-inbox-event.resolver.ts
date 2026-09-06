import { Args, Query, Resolver } from '@nestjs/graphql';
import { Allow, PaginatedList } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

import { IntegrationInboxEvent } from './entities/integration-inbox-event.entity';
import { FailedInboxEventListOptions, IntegrationInboxService } from './integration-inbox.service';

@Resolver()
export class IntegrationInboxEventResolver {
    constructor(private integrationInboxService: IntegrationInboxService) {}

    @Query()
    @Allow(CustomPermission.ManageAccessControl.Permission)
    async failedIntegrationInboxEvents(
        @Args() args: { options?: FailedInboxEventListOptions },
    ): Promise<PaginatedList<IntegrationInboxEvent>> {
        return this.integrationInboxService.findFailed(args.options);
    }
}
