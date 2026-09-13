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

// The WS identity attached by apps/server/src/subscriptions.ts — for administrators this also
// carries deniedBroadcastSourceTypes, computed once per connection via the same
// resolveBroadcastVisibility() the query path uses (see notification-source-permissions.ts), so a
// broadcast row an administrator can't read via the `notifications` query can also never arrive
// over their subscription (issue #87 audit, mivend.audit.85). A denylist (rather than an
// allowlist of every visible sourceType) is used because ungated sourceTypes are unbounded and
// visible by default — only the small, fixed set of gated sourceTypes this admin lacks
// permission for needs to travel with the connection identity.
export interface AdministratorSubscriptionIdentity {
    recipientType?: string;
    recipientId?: string;
    deniedBroadcastSourceTypes?: string[];
}

// Extracted to a named, directly-testable function rather than an inline lambda — mirrors
// NotificationService.findForRecipient's OR-condition: a connected administrator receives their
// own notifications AND every 'administrator-broadcast' event they have permission to see, not
// just events addressed to them by id. Customers have no broadcast concept.
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

    // graphql-ws subscriptions in this codebase's Vendure/NestJS version don't go through
    // Vendure's usual @Ctx() RequestContext injection (that relies on the HTTP AuthGuard
    // populating `req` — see apps/server's subscriptions wiring) — the WS connection's own
    // context object carries the resolved identity instead, attached by
    // apps/server/src/subscriptions.ts's connection `context` factory.
    @Subscription('notificationReceived', {
        filter: administratorNotificationSubscriptionFilter,
    })
    notificationReceived(@Context() context: unknown): AsyncIterableIterator<unknown> {
        if (!(context as { recipientType?: string })?.recipientType) {
            throw new ForbiddenError();
        }
        return this.pubSub.asyncIterableIterator(NOTIFICATION_RECEIVED);
    }

    // Any authenticated administrator may act on a broadcast notification (it has no single
    // owner) as well as their own — mirrors NotificationService.findForRecipient's OR-condition —
    // but only if they hold the sourceType's own gating permission (same rule as the `notifications`
    // query/subscription, see notification-source-permissions.ts): an admin who can't even see a
    // broadcast row must not be able to act on it by guessing its id either.
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
