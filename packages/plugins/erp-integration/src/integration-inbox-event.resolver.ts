import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, PaginatedList, UserInputError } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

import { IntegrationInboxEvent } from './entities/integration-inbox-event.entity';
import {
    IntegrationInboxBacklogByStream,
    IntegrationInboxHealthService,
} from './integration-inbox-health.service';
import { FailedInboxEventListOptions, IntegrationInboxService } from './integration-inbox.service';

function parseRowId(raw: string): number {
    const id = Number(raw);
    if (!Number.isSafeInteger(id) || id <= 0) {
        throw new UserInputError(`Invalid row id: ${raw}`);
    }
    return id;
}

@Resolver()
export class IntegrationInboxEventResolver {
    constructor(
        private integrationInboxService: IntegrationInboxService,
        private inboxHealth: IntegrationInboxHealthService,
    ) {}

    @Query()
    @Allow(CustomPermission.ManageAccessControl.Permission)
    async failedIntegrationInboxEvents(
        @Args() args: { options?: FailedInboxEventListOptions },
    ): Promise<PaginatedList<IntegrationInboxEvent>> {
        return this.integrationInboxService.findFailed(args.options);
    }

    @Query()
    @Allow(CustomPermission.ManageErpIntegration.Permission)
    async integrationInboxBacklog(): Promise<IntegrationInboxBacklogByStream[]> {
        return this.inboxHealth.getBacklogByStream();
    }

    // Terminal human resolution for a `failed` row that cannot be replayed (#212) — same
    // permission replayFailedIntegrationInbox uses, since both are write actions on inbox rows.
    @Mutation()
    @Allow(CustomPermission.RecoverIntegrationEvents.Permission)
    async dismissFailedIntegrationInbox(
        @Args() args: { id: string; reason: string },
    ): Promise<boolean> {
        if (!args.reason.trim()) {
            throw new UserInputError('A dismissal reason is required');
        }
        return this.integrationInboxService.dismissFailed(parseRowId(args.id), args.reason);
    }
}
