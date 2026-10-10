import { Parent, ResolveField, Resolver } from '@nestjs/graphql';

import type { IntegrationInboxEvent } from './entities/integration-inbox-event.entity';
import { streamToAggregateType } from './stream-aggregate-type';

@Resolver('IntegrationInboxIssue')
export class IntegrationInboxIssueResolver {
    @ResolveField()
    replayable(@Parent() row: IntegrationInboxEvent): boolean {
        return (
            row.status === 'failed' &&
            streamToAggregateType(row.stream) !== null &&
            !row.undecodable
        );
    }

    // An undecodable row (#212) is never replayable but must still be resolvable by a human.
    @ResolveField()
    dismissable(@Parent() row: IntegrationInboxEvent): boolean {
        return row.status === 'failed';
    }
}
