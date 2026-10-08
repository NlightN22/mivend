import { Parent, ResolveField, Resolver } from '@nestjs/graphql';

import type { IntegrationInboxEvent } from './entities/integration-inbox-event.entity';
import { streamToAggregateType } from './stream-aggregate-type';

@Resolver('IntegrationInboxIssue')
export class IntegrationInboxIssueResolver {
    @ResolveField()
    replayable(@Parent() row: IntegrationInboxEvent): boolean {
        return row.status === 'failed' && streamToAggregateType(row.stream) !== null;
    }
}
