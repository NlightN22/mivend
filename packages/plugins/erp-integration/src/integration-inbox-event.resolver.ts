import { Args, Query, Resolver } from '@nestjs/graphql';
import { Allow, PaginatedList, Permission } from '@vendure/core';

import { IntegrationInboxEvent } from './entities/integration-inbox-event.entity';
import { FailedInboxEventListOptions, IntegrationInboxService } from './integration-inbox.service';

@Resolver()
export class IntegrationInboxEventResolver {
    constructor(private integrationInboxService: IntegrationInboxService) {}

    @Query()
    @Allow(Permission.SuperAdmin)
    async failedIntegrationInboxEvents(
        @Args() args: { options?: FailedInboxEventListOptions },
    ): Promise<PaginatedList<IntegrationInboxEvent>> {
        return this.integrationInboxService.findFailed(args.options);
    }
}
