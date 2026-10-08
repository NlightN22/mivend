import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, RequestContext, UserInputError } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

import { IntegrationOutboxRecoveryService } from './integration-outbox-recovery.service';
import type { RebuildOutcome } from './integration-outbox-recovery.service';

const MAX_REQUEUE_IDS = 500;

const REBUILD_OUTCOME_ENUM: Record<RebuildOutcome, string> = {
    queued: 'QUEUED',
    'still-skipped': 'STILL_SKIPPED',
    'already-sent': 'ALREADY_SENT',
};

function parseOutboxId(raw: string): number {
    const id = Number(raw);
    if (!Number.isSafeInteger(id) || id <= 0) {
        throw new UserInputError(`Invalid outbox row id: ${raw}`);
    }
    return id;
}

// Write actions on outbox rows need RecoverIntegrationEvents; ManageErpIntegration only reads.
@Resolver()
export class IntegrationOutboxRecoveryResolver {
    constructor(private readonly recovery: IntegrationOutboxRecoveryService) {}

    @Mutation()
    @Allow(CustomPermission.RecoverIntegrationEvents.Permission)
    async requeueFailedIntegrationOutbox(@Args() args: { ids: string[] }): Promise<number> {
        if (args.ids.length === 0 || args.ids.length > MAX_REQUEUE_IDS) {
            throw new UserInputError(`Pass between 1 and ${MAX_REQUEUE_IDS} outbox row ids`);
        }
        return this.recovery.requeueFailed(args.ids.map(parseOutboxId));
    }

    @Mutation()
    @Allow(CustomPermission.RecoverIntegrationEvents.Permission)
    async rebuildSkippedIntegrationOutbox(
        @Ctx() ctx: RequestContext,
        @Args() args: { id: string },
    ): Promise<string> {
        const outcome = await this.recovery.rebuildSkipped(ctx, parseOutboxId(args.id));
        return REBUILD_OUTCOME_ENUM[outcome];
    }
}
