import { Inject, Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { PubSub } from 'graphql-subscriptions';

import {
    Notification,
    NotificationKind,
    NotificationRecipientType,
    NotificationStatus,
} from './entities/notification.entity';
import { NOTIFICATION_PUB_SUB } from './notification-pub-sub';
import { NOTIFICATION_RECEIVED } from './types';

export interface CreateNotificationInput {
    recipientType: NotificationRecipientType;
    recipientId: string;
    kind: NotificationKind;
    sourceType: string;
    sourceId?: string | null;
    title: string;
    message: string;
}

export interface FindForRecipientOptions {
    status?: NotificationStatus;
    take?: number;
}

const DEFAULT_LIST_TAKE = 50;

@Injectable()
export class NotificationService {
    constructor(
        private connection: TransactionalConnection,
        @Inject(NOTIFICATION_PUB_SUB) private pubSub: PubSub,
    ) {}

    // Upsert-by-source: a still-open (non-resolved) notification about the same (sourceType,
    // sourceId) is updated in place rather than piling up duplicates every time the producing
    // event fires again — mirrors ErpReconciliationIssue.recordIssue's own dedupe rule. Once a
    // notification is resolved, the next event for that source starts a fresh row: a resolved
    // notification is a closed record, not something later events should reopen.
    async create(ctx: RequestContext, input: CreateNotificationInput): Promise<Notification> {
        const repo = this.connection.getRepository(ctx, Notification);
        let notification: Notification | null = null;
        if (input.sourceId) {
            notification = await repo.findOne({
                where: {
                    sourceType: input.sourceType,
                    sourceId: input.sourceId,
                    recipientType: input.recipientType,
                    recipientId: input.recipientId,
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
            notification.status = 'unread';
        } else {
            notification = new Notification({
                recipientType: input.recipientType,
                recipientId: input.recipientId,
                kind: input.kind,
                sourceType: input.sourceType,
                sourceId: input.sourceId ?? null,
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

    async findOne(ctx: RequestContext, id: string): Promise<Notification | null> {
        const repo = this.connection.getRepository(ctx, Notification);
        return repo.findOne({ where: { id } });
    }

    async findForRecipient(
        ctx: RequestContext,
        recipientType: NotificationRecipientType,
        recipientId: string,
        opts: FindForRecipientOptions = {},
    ): Promise<Notification[]> {
        const repo = this.connection.getRepository(ctx, Notification);
        return repo.find({
            where: {
                recipientType,
                recipientId,
                ...(opts.status ? { status: opts.status } : {}),
            },
            order: { createdAt: 'DESC' },
            take: opts.take ?? DEFAULT_LIST_TAKE,
        });
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

    async resolve(ctx: RequestContext, id: string, resolution: string): Promise<Notification> {
        const repo = this.connection.getRepository(ctx, Notification);
        const notification = await repo.findOneOrFail({ where: { id } });
        notification.status = 'resolved';
        notification.resolvedAt = new Date();
        notification.resolution = resolution;
        return repo.save(notification);
    }
}
