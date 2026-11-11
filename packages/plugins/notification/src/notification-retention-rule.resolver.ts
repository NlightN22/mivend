import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { ID } from '@vendure/common/lib/shared-types';
import {
    Allow,
    Ctx,
    ListQueryOptions,
    PaginatedList,
    Permission,
    RequestContext,
    Transaction,
} from '@vendure/core';

import { NotificationRetentionRule } from './entities/notification-retention-rule.entity';
import { NotificationRetentionRuleService } from './notification-retention-rule.service';
import type { RetentionRuleValues } from './retention-rules';

// Global settings with no row scope: native settings permissions, no custom permission needed.
@Resolver()
export class NotificationRetentionRuleAdminResolver {
    constructor(private service: NotificationRetentionRuleService) {}

    @Query()
    @Allow(Permission.ReadSettings)
    notificationRetentionRules(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: ListQueryOptions<NotificationRetentionRule> },
    ): Promise<PaginatedList<NotificationRetentionRule>> {
        return this.service.findAll(ctx, args.options);
    }

    @Transaction()
    @Mutation()
    @Allow(Permission.UpdateSettings)
    updateNotificationRetentionRule(
        @Ctx() ctx: RequestContext,
        @Args() args: { id: ID; input: RetentionRuleValues },
    ): Promise<NotificationRetentionRule> {
        return this.service.update(ctx, args.id, args.input);
    }
}
