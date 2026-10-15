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

// Exported so apps/server's standalone subscriptions schema can reuse this filter directly.
// It does not reuse the @Subscription decorator's own filter wiring; see NotificationAdminResolver.
export function customerNotificationSubscriptionFilter(
    payload: NotificationReceivedEvent,
    _variables: unknown,
    context: unknown,
): boolean {
    const identity = context as { recipientType?: string; recipientId?: string } | undefined;
    return (
        identity?.recipientType === 'customer' &&
        identity.recipientId === payload.notificationReceived.recipientId
    );
}

// Permission.Owner is the convention for any logged-in customer scoped to their own data.
// Matches plugin-acquiring's PaymentShopResolver; adds no role-based permission (access-control.md).
@Resolver()
export class NotificationShopResolver {
    constructor(
        private notificationService: NotificationService,
        private recipientService: NotificationRecipientService,
        @Inject(NOTIFICATION_PUB_SUB) private pubSub: PubSub,
    ) {}

    @Query()
    @Allow(Permission.Owner)
    async notifications(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: NotificationListOptions },
    ): Promise<NotificationList> {
        const recipient = await this.recipientService.getCurrentCustomer(ctx);
        if (!recipient) return { items: [], totalItems: 0 };
        return this.notificationService.findForRecipient(
            ctx,
            recipient.recipientType,
            recipient.recipientId,
            args.options ?? {},
        );
    }

    @Mutation()
    @Allow(Permission.Owner)
    async markNotificationRead(
        @Ctx() ctx: RequestContext,
        @Args() args: { id: string },
    ): Promise<Notification> {
        await this.assertOwnNotification(ctx, args.id);
        return this.notificationService.markRead(ctx, args.id);
    }

    @Mutation()
    @Allow(Permission.Owner)
    async resolveNotification(
        @Ctx() ctx: RequestContext,
        @Args() args: { id: string; resolution: string },
    ): Promise<Notification> {
        await this.assertOwnNotification(ctx, args.id);
        return this.notificationService.resolve(ctx, args.id, args.resolution);
    }

    // See NotificationAdminResolver's identical comment — same WS-context fallback here.
    @Subscription('notificationReceived', {
        filter: customerNotificationSubscriptionFilter,
    })
    notificationReceived(@Context() context: unknown): AsyncIterableIterator<unknown> {
        if (!(context as { recipientType?: string })?.recipientType) {
            throw new ForbiddenError();
        }
        return this.pubSub.asyncIterableIterator(NOTIFICATION_RECEIVED);
    }

    private async assertOwnNotification(ctx: RequestContext, id: string): Promise<void> {
        const recipient = await this.recipientService.getCurrentCustomer(ctx);
        const notification = recipient ? await this.notificationService.findOne(ctx, id) : null;
        if (
            !recipient ||
            !notification ||
            notification.recipientType !== recipient.recipientType ||
            notification.recipientId !== recipient.recipientId
        ) {
            throw new ForbiddenError();
        }
    }
}
