import { Args, Context, Mutation, Query, Resolver, Subscription } from '@nestjs/graphql';
import { Allow, Ctx, ForbiddenError, Permission, RequestContext } from '@vendure/core';
import { Inject } from '@nestjs/common';
import { PubSub } from 'graphql-subscriptions';

import { Notification, NotificationStatus } from './entities/notification.entity';
import { NotificationService } from './notification.service';
import { NotificationRecipientService } from './notification-recipient.service';
import { NOTIFICATION_PUB_SUB } from './notification-pub-sub';
import { NOTIFICATION_RECEIVED, NotificationReceivedEvent } from './types';

// Authenticated-only, no role-based Permission — per docs/access-control.md's "permission = action
// only, scope = service layer": any signed-in administrator may read/act on their OWN
// notifications, and NotificationRecipientService (never client input) is what determines "own".
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
        @Args() args: { status?: NotificationStatus },
    ): Promise<Notification[]> {
        const recipient = await this.recipientService.getCurrentAdministrator(ctx);
        if (!recipient) return [];
        return this.notificationService.findForRecipient(
            ctx,
            recipient.recipientType,
            recipient.recipientId,
            { status: args.status },
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

    // graphql-ws subscriptions in this codebase's Vendure/NestJS version don't go through
    // Vendure's usual @Ctx() RequestContext injection (that relies on the HTTP AuthGuard
    // populating `req` — see apps/server's subscriptions wiring) — the WS connection's own
    // context object carries the resolved identity instead, attached by
    // apps/server/src/subscriptions.ts's connection `context` factory.
    @Subscription('notificationReceived', {
        filter: (payload: NotificationReceivedEvent, _variables: unknown, context: unknown) => {
            const identity = context as
                | { recipientType?: string; recipientId?: string }
                | undefined;
            return (
                identity?.recipientType === 'administrator' &&
                identity.recipientId === payload.notificationReceived.recipientId
            );
        },
    })
    notificationReceived(@Context() context: unknown): AsyncIterableIterator<unknown> {
        if (!(context as { recipientType?: string })?.recipientType) {
            throw new ForbiddenError();
        }
        return this.pubSub.asyncIterableIterator(NOTIFICATION_RECEIVED);
    }

    private async assertOwnNotification(ctx: RequestContext, id: string): Promise<void> {
        const recipient = await this.recipientService.getCurrentAdministrator(ctx);
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
