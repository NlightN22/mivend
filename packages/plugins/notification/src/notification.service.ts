import { Inject, Injectable } from '@nestjs/common';
import { PaginatedList, RequestContext, TransactionalConnection } from '@vendure/core';
import { Brackets, IsNull, Not } from 'typeorm';
import { PubSub } from 'graphql-subscriptions';

import {
    Notification,
    NotificationKind,
    NotificationRecipientType,
    NotificationStatus,
} from './entities/notification.entity';
import { NOTIFICATION_PUB_SUB } from './notification-pub-sub';
import { NOTIFICATION_RECEIVED } from './types';
import { resolveBroadcastVisibility } from './notification-source-permissions';

export interface CreateNotificationInput {
    recipientType: NotificationRecipientType;
    // Ignored for recipientType === 'administrator-broadcast' — a broadcast row has no single
    // recipient, so its recipientId is always stored as null regardless of what is passed here.
    recipientId?: string | null;
    kind: NotificationKind;
    sourceType: string;
    sourceId?: string | null;
    // The order the broadcast is about; it limits the broadcast to that order's viewers.
    orderId?: string | null;
    title: string;
    message: string;
}

export interface FindForRecipientOptions {
    status?: NotificationStatus;
    // Case-insensitive contains match against title (issue #92's full notifications page).
    search?: string;
    take?: number;
    skip?: number;
}

export interface VisibleOrdersSql {
    sql: string;
    params: Record<string, unknown>;
}

const DEFAULT_LIST_TAKE = 50;
const MAX_LIST_TAKE = 100;

@Injectable()
export class NotificationService {
    constructor(
        private connection: TransactionalConnection,
        @Inject(NOTIFICATION_PUB_SUB) private pubSub: PubSub,
    ) {}

    // An open notification for the same (sourceType, sourceId) is updated in place, not duplicated.
    // A resolved one is a closed record, so the next event for that source inserts a fresh row.
    async create(ctx: RequestContext, input: CreateNotificationInput): Promise<Notification> {
        const repo = this.connection.getRepository(ctx, Notification);
        // Broadcast rows have no single recipient: recipientId is forced to null regardless of input.
        // So the dedupe key collapses to (sourceType, sourceId, recipientType): one row, not one per admin.
        const recipientId =
            input.recipientType === 'administrator-broadcast' ? null : (input.recipientId ?? null);
        let notification: Notification | null = null;
        if (input.sourceId) {
            notification = await repo.findOne({
                where: {
                    sourceType: input.sourceType,
                    sourceId: input.sourceId,
                    recipientType: input.recipientType,
                    recipientId: recipientId ?? IsNull(),
                },
                order: { createdAt: 'DESC' },
            });
            if (notification && notification.status === 'resolved') {
                notification = null;
            }
        }

        if (notification) {
            notification.kind = input.kind;
            notification.title = input.title;
            notification.message = input.message;
            notification.orderId = input.orderId ?? notification.orderId;
            notification.status = 'unread';
        } else {
            notification = new Notification({
                recipientType: input.recipientType,
                recipientId,
                kind: input.kind,
                sourceType: input.sourceType,
                sourceId: input.sourceId ?? null,
                orderId: input.orderId ?? null,
                title: input.title,
                message: input.message,
                status: 'unread',
                readAt: null,
                resolvedAt: null,
                resolution: null,
            });
        }

        const saved = await repo.save(notification);
        await this.pubSub.publish(NOTIFICATION_RECEIVED, {
            notificationReceived: saved,
        });
        return saved;
    }

    // Exposed so apps/server's WS-subscriptions schema attaches to the same PubSub instance.
    // Resolving NOTIFICATION_PUB_SUB via app.get() from a bootstrap hook proved unreliable.
    subscribeToReceived(): AsyncIterableIterator<unknown> {
        return this.pubSub.asyncIterableIterator(NOTIFICATION_RECEIVED);
    }

    async findOne(ctx: RequestContext, id: string): Promise<Notification | null> {
        const repo = this.connection.getRepository(ctx, Notification);
        return repo.findOne({ where: { id } });
    }

    // For administrators, also returns 'administrator-broadcast' rows the admin has permission for.
    // Filtered in SQL, not JS, so pagination and totalItems stay accurate. Customers get none.
    async findForRecipient(
        ctx: RequestContext,
        recipientType: NotificationRecipientType,
        recipientId: string,
        opts: FindForRecipientOptions = {},
        // SQL of the order ids the caller sees; null means every order (scope 'all').
        visibleOrders: VisibleOrdersSql | null = null,
    ): Promise<PaginatedList<Notification>> {
        // Clamp negative client input: a raw LIMIT -1 reaches Postgres and surfaces as a GraphQL 500.
        // Also cap at MAX_LIST_TAKE.
        const take = Math.min(Math.max(opts.take ?? DEFAULT_LIST_TAKE, 0), MAX_LIST_TAKE);
        const skip = Math.max(opts.skip ?? 0, 0);

        const qb = this.connection
            .getRepository(ctx, Notification)
            .createQueryBuilder('notification');

        if (recipientType === 'administrator') {
            const { gatedSourceTypes, allowedGatedSourceTypes } = resolveBroadcastVisibility(ctx);
            qb.where(
                new Brackets(qbInner => {
                    qbInner
                        .where(
                            'notification.recipientType = :ownType AND notification.recipientId = :recipientId',
                            { ownType: 'administrator', recipientId },
                        )
                        .orWhere(
                            new Brackets(broadcastQb => {
                                broadcastQb.where('notification.recipientType = :broadcastType', {
                                    broadcastType: 'administrator-broadcast',
                                });
                                if (gatedSourceTypes.length > 0) {
                                    broadcastQb.andWhere(
                                        new Brackets(gateQb => {
                                            gateQb
                                                .where(
                                                    'notification.sourceType NOT IN (:...gatedSourceTypes)',
                                                    { gatedSourceTypes },
                                                )
                                                .orWhere(
                                                    allowedGatedSourceTypes.length > 0
                                                        ? 'notification.sourceType IN (:...allowedGatedSourceTypes)'
                                                        : '1 = 0',
                                                    { allowedGatedSourceTypes },
                                                );
                                        }),
                                    );
                                }
                                if (visibleOrders) {
                                    broadcastQb.andWhere(
                                        `(notification.orderId IS NULL OR notification.orderId IN (${visibleOrders.sql}))`,
                                        visibleOrders.params,
                                    );
                                }
                            }),
                        );
                }),
            );
        } else {
            qb.where(
                'notification.recipientType = :recipientType AND notification.recipientId = :recipientId',
                {
                    recipientType,
                    recipientId,
                },
            );
        }

        if (opts.status) {
            qb.andWhere('notification.status = :status', { status: opts.status });
        }

        if (opts.search) {
            qb.andWhere('notification.title ILIKE :search', { search: `%${opts.search}%` });
        }

        const [items, totalItems] = await qb
            .orderBy('notification.createdAt', 'DESC')
            .addOrderBy('notification.id', 'DESC')
            .take(take)
            .skip(skip)
            .getManyAndCount();

        return { items, totalItems };
    }

    async markRead(ctx: RequestContext, id: string): Promise<Notification> {
        const repo = this.connection.getRepository(ctx, Notification);
        const notification = await repo.findOneOrFail({ where: { id } });
        if (notification.status === 'unread') {
            notification.status = 'read';
            notification.readAt = new Date();
            return repo.save(notification);
        }
        return notification;
    }

    // Broadcast rows share read/resolved state across all admins, matching the shared issue status.
    // Adding per-viewer state here requires changing that underlying assumption too.
    async resolve(ctx: RequestContext, id: string, resolution: string): Promise<Notification> {
        const repo = this.connection.getRepository(ctx, Notification);
        const notification = await repo.findOneOrFail({ where: { id } });
        notification.status = 'resolved';
        notification.resolvedAt = new Date();
        notification.resolution = resolution;
        return repo.save(notification);
    }

    // Match on (sourceType, sourceId) only: one source can have rows with differing or null recipientId.
    // Filtering by recipientId would leave some rows orphaned as unread forever.
    async resolveBySource(
        ctx: RequestContext,
        source: { sourceType: string; sourceId: string },
        resolution: string,
    ): Promise<Notification[]> {
        const repo = this.connection.getRepository(ctx, Notification);
        const open = await repo.find({
            where: {
                sourceType: source.sourceType,
                sourceId: source.sourceId,
                status: Not('resolved'),
            },
        });
        if (open.length === 0) return [];

        const resolvedAt = new Date();
        for (const notification of open) {
            notification.status = 'resolved';
            notification.resolvedAt = resolvedAt;
            notification.resolution = resolution;
        }
        return repo.save(open);
    }
}
