import { Args, Query, Resolver } from '@nestjs/graphql';
import { Allow, UserInputError } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

import { IntegrationEventListService } from './integration-event-list.service';
import type { IntegrationEventList, OutboxProblemRow } from './integration-event-list.service';
import type { IntegrationInboxEvent } from './entities/integration-inbox-event.entity';
import { InvalidListOptionsError } from './list-options';
import type { ListOptionsInput } from './list-options';

async function guarded<T>(work: Promise<T>): Promise<T> {
    try {
        return await work;
    } catch (error) {
        if (error instanceof InvalidListOptionsError) throw new UserInputError(error.message);
        throw error;
    }
}

@Resolver()
export class IntegrationEventListResolver {
    constructor(private readonly lists: IntegrationEventListService) {}

    @Query()
    @Allow(CustomPermission.ManageErpIntegration.Permission)
    integrationInboxIssues(
        @Args() args: { options?: ListOptionsInput },
    ): Promise<IntegrationEventList<IntegrationInboxEvent>> {
        return guarded(this.lists.listInboxIssues(args.options));
    }

    @Query()
    @Allow(CustomPermission.ManageErpIntegration.Permission)
    integrationOutboxProblems(
        @Args() args: { options?: ListOptionsInput },
    ): Promise<IntegrationEventList<OutboxProblemRow>> {
        return guarded(this.lists.listOutboxProblems(args.options));
    }
}
