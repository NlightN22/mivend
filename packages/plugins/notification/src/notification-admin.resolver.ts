import { Args, Context, Mutation, Query, Resolver, Subscription } from '@nestjs/graphql';
import { Allow, Ctx, ForbiddenError, Permission, RequestContext } from '@vendure/core';
import { Inject } from '@nestjs/common';
import { PubSub } from 'graphql-subscriptions';

import { Notification } from './entities/notification.entity';
import { NotificationService } from './notification.service';
import { NotificationRecipientService } from './notification-recipient.service';
import { NOTIFICATION_PUB_SUB } from './notification-pub-sub';
import {
    NOTIFICATION_RECEIVED,
    NotificationList,
    NotificationListOptions,
    NotificationReceivedEvent,
} from './types';
import { NOTIFICATION_SOURCE_PERMISSIONS } from './notification-source-permissions';

// Same resolver as the query, run once per connection: unreadable broadcasts never stream.
// Denylist, not allowlist: ungated sourceTypes are unbounded and visible by default.
export interface AdministratorSubscriptionIdentity {
    recipientType?: string;
    recipientId?: string;
    deniedBroadcastSourceTypes?: string[];
}

// Mirrors NotificationService.findForRecipient's OR-condition: admins also get permitted broadcasts.
// Customers have no broadcast concept, so this filter must not apply to them.
export function administratorNotificationSubscriptionFilter(
    payload: NotificationReceivedEvent,
    _variables: unknown,
    context: unknown,
): boolean {
    const identity = context as AdministratorSubscriptionIdentity | undefined;
    if (identity?.recipientType !== 'administrator') return false;
    const { recipientType, recipientId, sourceType } = payload.notificationReceived;
    if (recipientType === 'administrator') {
        return recipientId === identity.recipientId;
    }
    if (recipientType === 'administrator-broadcast') {
        return !(identity.deniedBroadcastSourceTypes ?? []).includes(sourceType);
    }
    return false;
}

// Permission covers the action only; scope is the service layer (docs/access-control.md).
// Ownership comes from NotificationRecipientService, never client input.
@Resolver()
export class NotificationAdminResolver {
    constructor(
        private notificationService: NotificationService,
        private recipientService: NotificationRecipientService,
        @Inject(NOTIFICATION_PUB_SUB) private pubSub: PubSub,
    ) {}

    @Query()
    @Allow(Permission.Authenticated)
    async notifications(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: NotificationListOptions },
    ): Promise<NotificationList> {
        const recipient = await this.recipientService.getCurrentAdministrator(ctx);
        if (!recipient) return { items: [], totalItems: 0 };
        return this.notificationService.findForRecipient(
            ctx,
            recipient.recipientType,
            recipient.recipientId,
            args.options ?? {},
        );
    }

    @Mutation()
    @Allow(Permission.Authenticated)
    async markNotificationRead(
        @Ctx() ctx: RequestContext,
        @Args() args: { id: string },
    ): Promise<Notification> {
        await this.assertOwnNotification(ctx, args.id);
        return this.notificationService.markRead(ctx, args.id);
    }

    @Mutation()
    @Allow(Permission.Authenticated)
    async resolveNotification(
        @Ctx() ctx: RequestContext,
        @Args() args: { id: string; resolution: string },
    ): Promise<Notification> {
        await this.assertOwnNotification(ctx, args.id);
        return this.notificationService.resolve(ctx, args.id, args.resolution);
    }

    // graphql-ws skips Vendure's @Ctx() RequestContext, which needs the HTTP AuthGuard to set req.
    // The WS connection context factory in subscriptions.ts supplies the identity instead.
    @Subscription('notificationReceived', {
        filter: administratorNotificationSubscriptionFilter,
    })
    notificationReceived(@Context() context: unknown): AsyncIterableIterator<unknown> {
        if (!(context as { recipientType?: string })?.recipientType) {
            throw new ForbiddenError();
        }
        return this.pubSub.asyncIterableIterator(NOTIFICATION_RECEIVED);
    }

    // Broadcasts have no owner: admins act on them only with the sourceType's gating permission.
    // Otherwise guessing an id would bypass the visibility rule of the notifications query.
    private async assertOwnNotification(ctx: RequestContext, id: string): Promise<void> {
        const recipient = await this.recipientService.getCurrentAdministrator(ctx);
        const notification = recipient ? await this.notificationService.findOne(ctx, id) : null;
        const isOwn =
            !!notification &&
            notification.recipientType === recipient?.recipientType &&
            notification.recipientId === recipient.recipientId;
        const requiredPermission = notification
            ? NOTIFICATION_SOURCE_PERMISSIONS[notification.sourceType]
            : undefined;
        const isPermittedBroadcast =
            notification?.recipientType === 'administrator-broadcast' &&
            (!requiredPermission || ctx.userHasPermissions([requiredPermission]));
        if (!recipient || !notification || (!isOwn && !isPermittedBroadcast)) {
            throw new ForbiddenError();
        }
    }
}
