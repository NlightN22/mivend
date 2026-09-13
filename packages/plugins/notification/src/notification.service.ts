import { Inject, Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { IsNull } from 'typeorm';
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
    // Ignored for recipientType === 'administrator-broadcast' — a broadcast row has no single
    // recipient, so its recipientId is always stored as null regardless of what is passed here.
    recipientId?: string | null;
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
        // Broadcast rows have no single recipient — recipientId is always null for them,
        // regardless of what (if anything) the caller passed. This keeps the dedupe key below
        // effectively (sourceType, sourceId, recipientType) for broadcast rows, so a single row
        // is upserted rather than one per administrator.
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
            notification.status = 'unread';
        } else {
            notification = new Notification({
                recipientType: input.recipientType,
                recipientId,
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

    // For recipientType === 'administrator', this also returns every 'administrator-broadcast'
    // row (issue #87 Part 2 / #42) — any authenticated administrator sees all broadcast
    // notifications, in addition to their own. Customers have no broadcast concept: a customer
    // query never includes broadcast rows.
    async findForRecipient(
        ctx: RequestContext,
        recipientType: NotificationRecipientType,
        recipientId: string,
        opts: FindForRecipientOptions = {},
    ): Promise<Notification[]> {
        const repo = this.connection.getRepository(ctx, Notification);
        const statusFilter = opts.status ? { status: opts.status } : {};
        const where =
            recipientType === 'administrator'
                ? [
                      { recipientType: 'administrator' as const, recipientId, ...statusFilter },
                      { recipientType: 'administrator-broadcast' as const, ...statusFilter },
                  ]
                : { recipientType, recipientId, ...statusFilter };
        return repo.find({
            where,
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

    // Broadcast rows (recipientType === 'administrator-broadcast') have shared, not per-viewer,
    // read/resolved state: this matches ReservationReconciliationIssue/PaymentReconciliationIssue/
    // ErpReconciliationIssue, which all carry a single shared `status` column per issue, not a
    // per-admin read marker. Whichever administrator acts on a broadcast notification marks it
    // read/resolved for every administrator who sees it — do not add per-viewer state here
    // without also changing that underlying assumption.
    async resolve(ctx: RequestContext, id: string, resolution: string): Promise<Notification> {
        const repo = this.connection.getRepository(ctx, Notification);
        const notification = await repo.findOneOrFail({ where: { id } });
        notification.status = 'resolved';
        notification.resolvedAt = new Date();
        notification.resolution = resolution;
        return repo.save(notification);
    }
}
